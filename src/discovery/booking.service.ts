import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ReferenceNumberService } from '../common/services/reference-number.service';
import { SpamCheckService } from '../common/services/spam-check.service';
import {
  addBusinessDays,
  getZonedParts,
} from '../common/utils/business-hours.util';
import { MailService } from '../mail/mail.service';
import { MasterDataService } from '../master-data/master-data.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsDto } from './dto/list-bookings.dto';
import {
  DELIVERABLE_BUSINESS_DAYS,
  DiscoveryBooking,
} from './entities/discovery-booking.entity';
import type { BookingStatus } from './entities/discovery-booking.entity';
import { SessionSlot } from './entities/session-slot.entity';

const REFERENCE_PREFIX = 'DC';
const REFERENCE_SEQUENCE = 'discovery_booking_ref_seq';

export interface BookingContext {
  ip?: string;
  userAgent?: string;
}

export interface BookingResult {
  referenceNo: string;
  manageToken: string;
  startsAt: Date;
  localTime: string;
  architect: string;
  message: string;
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectRepository(DiscoveryBooking)
    private readonly bookingRepo: Repository<DiscoveryBooking>,
    @InjectRepository(SessionSlot)
    private readonly slotRepo: Repository<SessionSlot>,
    private readonly dataSource: DataSource,
    private readonly referenceNumbers: ReferenceNumberService,
    private readonly spamCheck: SpamCheckService,
    private readonly mail: MailService,
    private readonly masterData: MasterDataService,
    private readonly config: ConfigService,
  ) {}

  // -----------------------------------------------------------------------
  // Public booking
  // -----------------------------------------------------------------------

  async book(
    dto: CreateBookingDto,
    context: BookingContext,
    siteCode: number,
  ): Promise<BookingResult> {
    const now = new Date();

    const spam = await this.spamCheck.evaluate({
      honeypot: dto.website,
      captchaToken: dto.captchaToken,
      email: dto.workEmail,
      ip: context.ip,
    });

    const slot = await this.slotRepo.findOne({
      where: { id: dto.slotId },
      relations: { architect: { office: true, practices: true } },
    });
    if (!slot) throw new NotFoundException('That slot no longer exists');
    if (slot.startsAt <= now) {
      throw new ConflictException('That slot is in the past');
    }

    const office = slot.architect?.office;
    if (!office) {
      throw new NotFoundException('Architect is not assigned to an office');
    }

    // Deliverables are promised within two business days of the session, on the
    // architect's own office calendar — Riyadh runs Sun–Thu, the others Mon–Fri.
    const deliverablesDueAt = addBusinessDays(
      slot.startsAt,
      DELIVERABLE_BUSINESS_DAYS,
      {
        timezone: office.timezone,
        workingDays: office.workingDays,
        workStartHour: office.workStartHour,
        workEndHour: office.workEndHour,
      },
    );

    const manageToken = randomBytes(24).toString('hex');

    const booking = await this.dataSource.transaction(async (manager) => {
      // The claim. A conditional UPDATE is what makes double-booking
      // impossible: two concurrent requests both run it, exactly one matches
      // status = 'FREE', and the loser gets zero affected rows.
      const claim = await manager
        .createQueryBuilder()
        .update(SessionSlot)
        .set({ status: 'BOOKED' })
        .where('id = :id AND status = :free', { id: slot.id, free: 'FREE' })
        .execute();

      if (claim.affected === 0) {
        throw new ConflictException(
          'That slot was just taken. Please choose another time.',
        );
      }

      const referenceNo = await this.referenceNumbers.next(
        REFERENCE_PREFIX,
        REFERENCE_SEQUENCE,
        manager,
      );

      return manager.save(
        manager.create(DiscoveryBooking, {
          referenceNo,
          siteCode,
          slotId: slot.id,
          architectId: slot.architectId,
          fullName: dto.fullName,
          company: dto.company,
          roleTitle: dto.roleTitle,
          workEmail: dto.workEmail,
          programme: dto.programme,
          requiresNda: dto.requiresNda ?? false,
          attendeeTimezone: dto.timezone,
          consentAt: now,
          privacyNoticeVersion: this.config.getOrThrow<string>(
            'PRIVACY_NOTICE_VERSION',
          ),
          status: 'BOOKED',
          deliverablesDueAt,
          manageToken,
          sourcePage: dto.sourcePage ?? null,
          ipHash: this.spamCheck.hashIp(context.ip),
          userAgent: context.userAgent ?? null,
          spamScore: spam.score,
        }),
      );
    });

    const parts = getZonedParts(slot.startsAt, dto.timezone);
    const localTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    const architectName =
      slot.architect?.fullName ??
      slot.architect?.displayTitle ??
      'Senior Architect';

    await this.sendConfirmation(
      booking,
      slot,
      architectName,
      localTime,
      dto.timezone,
    );

    return {
      referenceNo: booking.referenceNo,
      manageToken: booking.manageToken,
      startsAt: slot.startsAt,
      localTime,
      architect: architectName,
      message:
        'Your session is confirmed. The architect’s name and credentials will be in your calendar invite within five minutes.',
    };
  }

  /** The attendee's own view — no account, just the token from their email. */
  async findByToken(
    token: string,
    siteCode: number,
  ): Promise<DiscoveryBooking> {
    const booking = await this.bookingRepo.findOne({
      where: { manageToken: token, isDeleted: false, siteCode },
      relations: { slot: true, architect: { practices: true } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  /** Cancelling releases the slot so someone else can take it. */
  async cancelByToken(
    token: string,
    siteCode: number,
  ): Promise<{ message: string }> {
    const booking = await this.findByToken(token, siteCode);
    if (booking.status === 'CANCELLED') {
      return { message: 'This booking was already cancelled' };
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        DiscoveryBooking,
        { id: booking.id },
        { status: 'CANCELLED', cancelledAt: new Date() },
      );
      await manager.update(
        SessionSlot,
        { id: booking.slotId },
        { status: 'FREE' },
      );
    });

    return { message: 'Your session has been cancelled' };
  }

  // -----------------------------------------------------------------------
  // Admin
  // -----------------------------------------------------------------------

  async list(
    query: ListBookingsDto,
    siteCode: number,
  ): Promise<PaginatedResult<DiscoveryBooking>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.slot', 'slot')
      .leftJoinAndSelect('booking.architect', 'architect')
      .leftJoinAndSelect('architect.practices', 'practice')
      .where('booking.isDeleted = false')
      .andWhere('booking.siteCode = :siteCode', { siteCode });

    if (query.status) {
      qb.andWhere('booking.status = :status', { status: query.status });
    }
    if (query.practiceCode !== undefined) {
      // EXISTS rather than filtering the joined rows, so a booking with an
      // architect covering several practices still returns the full list.
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM architect_practices ap
           WHERE ap.architect_id = booking.architect_id
             AND ap.practice_code = :practiceCode
         )`,
        { practiceCode: query.practiceCode },
      );
    }
    if (query.search) {
      qb.andWhere(
        '(booking.company ILIKE :s OR booking.fullName ILIKE :s OR booking.referenceNo ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    const [items, total] = await qb
      .orderBy('slot.startsAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Full record including the programme description. */
  /** Choke point for the admin surface — setStatus reads through it. */
  async findById(id: string, siteCode: number): Promise<DiscoveryBooking> {
    const booking = await this.bookingRepo
      .createQueryBuilder('booking')
      .addSelect('booking.programme')
      .leftJoinAndSelect('booking.slot', 'slot')
      .leftJoinAndSelect('booking.architect', 'architect')
      .where('booking.id = :id', { id })
      .andWhere('booking.isDeleted = false')
      .andWhere('booking.siteCode = :siteCode', { siteCode })
      .getOne();

    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return booking;
  }

  async setStatus(
    id: string,
    status: BookingStatus,
    siteCode: number,
  ): Promise<DiscoveryBooking> {
    const booking = await this.findById(id, siteCode);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        DiscoveryBooking,
        { id },
        {
          status,
          ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
        },
      );
      // Cancelling frees the slot; other transitions leave it taken.
      if (status === 'CANCELLED') {
        await manager.update(
          SessionSlot,
          { id: booking.slotId },
          { status: 'FREE' },
        );
      }
    });

    return this.findById(id, siteCode);
  }

  // -----------------------------------------------------------------------
  // Notifications
  // -----------------------------------------------------------------------

  private async sendConfirmation(
    booking: DiscoveryBooking,
    slot: SessionSlot,
    architectName: string,
    localTime: string,
    timezone: string,
  ): Promise<void> {
    const parts = getZonedParts(slot.startsAt, timezone);
    const when = `${parts.day}/${parts.month}/${parts.year} at ${localTime} (${timezone})`;

    await this.mail.send({
      to: booking.workEmail,
      subject: `Discovery session confirmed — ${booking.referenceNo}`,
      body: [
        `Hello ${booking.fullName},`,
        ``,
        `Your 45-minute discovery session is confirmed.`,
        ``,
        `When:      ${when}`,
        `Architect: ${architectName}`,
        `Reference: ${booking.referenceNo}`,
        ``,
        `The session runs to a 10 / 25 / 10 format — context, architecture,`,
        `next steps. You will receive an architectural memo, regulatory`,
        `checklist and scoping table within two business days afterwards.`,
        ``,
        booking.requiresNda
          ? `You asked for a mutual NDA before the session. We will send it separately.`
          : ``,
        `To view or cancel: /discovery/bookings/${booking.manageToken}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    // The programme description is withheld from the internal notification when
    // the attendee has flagged it confidential, as on the contact form.
    await this.mail.send({
      to: 'contact@veltrixair.com',
      subject: `[${booking.referenceNo}] Discovery session — ${booking.company}`,
      replyTo: booking.workEmail,
      body: [
        `New discovery session booked.`,
        ``,
        `Company:   ${booking.company}`,
        `Attendee:  ${booking.fullName}, ${booking.roleTitle}`,
        `Email:     ${booking.workEmail}`,
        `When:      ${when}`,
        `Architect: ${architectName}`,
        `Due:       deliverables by ${booking.deliverablesDueAt.toISOString()}`,
        ``,
        booking.requiresNda
          ? `NDA REQUESTED — the programme description is withheld from this email.\nOpen the booking in the admin panel to read it.`
          : booking.programme,
      ].join('\n'),
    });

    await this.bookingRepo.update(
      { id: booking.id },
      { inviteSentAt: new Date() },
    );
  }
}
