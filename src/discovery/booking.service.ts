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
import { FEATURE } from '../auth/permissions.constants';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notifications/notification.service';
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

/** A candidate who can cover a session at the hour it is already booked. */
export interface ReassignmentOption {
  slotId: string;
  architectId: string;
  name: string;
  practices: string[];
  /** False when they do not cover the practice the visitor originally chose. */
  coversPractice: boolean;
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
    private readonly notifications: NotificationService,
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

    /*
     * The panel's bell. The architect is named because the first thing anyone
     * asks of a new booking is whose diary it landed in.
     */
    await this.notifications.raise({
      siteCode,
      featureCode: FEATURE.IT_DISCOVERY,
      category: 'architect',
      lead: 'Architect request',
      body: `${booking.fullName} · ${booking.company} · with ${architectName}`,
      link: `/architect/${booking.id}`,
      sourceType: 'discovery_booking',
      sourceId: booking.id,
    });

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
    if (query.architectId) {
      qb.andWhere('booking.architectId = :architectId', {
        architectId: query.architectId,
      });
    }
    /*
     * Filtered on the session time, not on when the booking was taken. "This
     * week" means the calls happening this week — nobody plans a diary around
     * when the form was filled in.
     */
    if (query.from) {
      qb.andWhere('slot.startsAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('slot.startsAt <= :to', { to: query.to });
    }

    const [items, total] = await qb
      .orderBy('slot.startsAt', query.sort === 'soonest' ? 'ASC' : 'DESC')
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
      // Practices too, so one booking has the same shape here as in the list.
      // Without it `architect.practices` is undefined on the detail alone —
      // the kind of difference a caller cannot see until it breaks at runtime.
      .leftJoinAndSelect('architect.practices', 'practice')
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


  /**
   * Who could take this session at the time it is already booked for.
   *
   * Emergency cover only: the attendee chose that hour around their own diary,
   * so the time is the fixed part and the architect is the flexible one. A
   * candidate qualifies when they hold their own slot at exactly this
   * `startsAt` and it is still FREE — slots are unique per architect and time,
   * so "the same slot with someone else" is really a second row.
   */
  async reassignmentOptions(
    id: string,
    siteCode: number,
  ): Promise<ReassignmentOption[]> {
    const booking = await this.findById(id, siteCode);
    if (!booking.slot) return [];

    /*
     * Cover is only meaningful before the hour arrives. A session that has
     * already started needs an outcome recorded, not a different architect —
     * offering one would suggest the call can still be rescued.
     */
    if (booking.slot.startsAt <= new Date()) return [];

    const wanted = new Set(
      (booking.architect?.practices ?? []).map((pr) => pr.practiceCode),
    );

    const slots = await this.slotRepo.find({
      where: {
        siteCode,
        status: 'FREE',
        startsAt: booking.slot.startsAt,
      },
      relations: { architect: { practices: true } },
      order: { startsAt: 'ASC' },
    });

    return slots
      .filter((slot) => slot.architect?.isActive && !slot.architect.isDeleted)
      .map((slot) => {
        const architect = slot.architect!;
        const practices = architect.practices ?? [];
        return {
          slotId: slot.id,
          architectId: architect.id,
          name: architect.fullName ?? architect.displayTitle,
          practices: practices.map((pr) => pr.practiceName),
          /*
           * Surfaced rather than filtered on. In an emergency a covering
           * architect outside the visitor's chosen practice is better than
           * nobody, but whoever presses the button should see they are doing
           * it.
           */
          coversPractice: practices.some((pr) => wanted.has(pr.practiceCode)),
        };
      });
  }

  /**
   * Hand an already-booked session to a different architect, same hour.
   *
   * Deliberately not a reschedule: the time never moves. What moves is which
   * slot row the booking points at, because `booking.architectId` is a copy of
   * `slot.architectId` — writing one without the other would leave the booking
   * naming one person while that person's own diary named another.
   */
  async reassign(
    id: string,
    architectId: string,
    siteCode: number,
  ): Promise<DiscoveryBooking> {
    const booking = await this.findById(id, siteCode);

    if (booking.status !== 'BOOKED') {
      throw new ConflictException(
        'Only a booked session can be reassigned. This one is ' +
          booking.status.toLowerCase().replace('_', ' ') +
          '.',
      );
    }
    if (!booking.slot) {
      throw new NotFoundException('This booking has no slot to reassign');
    }
    if (booking.architectId === architectId) {
      throw new ConflictException('That is already the assigned architect');
    }
    if (booking.slot.startsAt <= new Date()) {
      throw new ConflictException(
        'This session has already started. Record an outcome instead.',
      );
    }

    const target = await this.slotRepo.findOne({
      where: { architectId, startsAt: booking.slot.startsAt, siteCode },
      relations: { architect: { office: true } },
    });
    if (!target) {
      throw new NotFoundException(
        'That architect has no session at this time — they cannot cover it',
      );
    }

    const office = target.architect?.office;
    if (!office) {
      throw new NotFoundException('Architect is not assigned to an office');
    }

    /*
     * The promise moves even though the hour does not.
     *
     * Deliverables are due two business days after the session on the
     * architect's *own* office calendar, and Riyadh runs Sun-Thu while the
     * others run Mon-Fri. Covering a Thursday session from India lands the
     * memo on a different date, so it is recalculated rather than carried.
     */
    const deliverablesDueAt = addBusinessDays(
      booking.slot.startsAt,
      DELIVERABLE_BUSINESS_DAYS,
      {
        timezone: office.timezone,
        workingDays: office.workingDays,
        workStartHour: office.workStartHour,
        workEndHour: office.workEndHour,
      },
    );

    const previousSlotId = booking.slotId;

    await this.dataSource.transaction(async (manager) => {
      // The same conditional claim `book()` uses. Two admins reassigning at
      // once both run it, exactly one matches FREE, and the loser is told.
      const claim = await manager
        .createQueryBuilder()
        .update(SessionSlot)
        .set({ status: 'BOOKED' })
        .where('id = :id AND status = :free', { id: target.id, free: 'FREE' })
        .execute();

      if (claim.affected === 0) {
        throw new ConflictException(
          'That architect was just booked for this time. Choose another.',
        );
      }

      await manager.update(
        DiscoveryBooking,
        { id },
        { slotId: target.id, architectId, deliverablesDueAt },
      );

      // Released last, so a failure above never frees a slot we still hold.
      await manager.update(
        SessionSlot,
        { id: previousSlotId },
        { status: 'FREE' },
      );
    });

    const updated = await this.findById(id, siteCode);
    await this.sendReassignment(updated);
    return updated;
  }

  /**
   * Tell the attendee who they are now meeting.
   *
   * Nothing they hold becomes wrong except the name: same hour, same link,
   * same reference. So this reads as an update to an existing arrangement
   * rather than a fresh confirmation, and does not ask them to do anything.
   */
  private async sendReassignment(booking: DiscoveryBooking): Promise<void> {
    if (!booking.slot) return;

    const timezone = booking.attendeeTimezone;
    const parts = getZonedParts(booking.slot.startsAt, timezone);
    const localTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    const when = `${parts.day}/${parts.month}/${parts.year} at ${localTime} (${timezone})`;
    const architectName =
      booking.architect?.fullName ??
      booking.architect?.displayTitle ??
      'Senior Architect';

    await this.mail.send({
      to: booking.workEmail,
      subject: `Your discovery session — a change of architect (${booking.referenceNo})`,
      body: [
        `Hello ${booking.fullName},`,
        ``,
        `Your discovery session is unchanged in every respect but one: a`,
        `different architect will now be joining you.`,
        ``,
        `When:      ${when} — unchanged`,
        `Architect: ${architectName}`,
        `Reference: ${booking.referenceNo}`,
        ``,
        `There is nothing you need to do. Your existing calendar invitation`,
        `and link remain valid.`,
        ``,
        `To view or cancel: /discovery/bookings/${booking.manageToken}`,
      ].join('\n'),
    });
  }

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
