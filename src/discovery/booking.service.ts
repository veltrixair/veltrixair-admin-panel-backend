import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Between, DataSource, In, Not, Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ReferenceNumberService } from '../common/services/reference-number.service';
import { SpamCheckService } from '../common/services/spam-check.service';
import { joinPhone } from '../common/utils/phone.util';
import { getZonedParts } from '../common/utils/business-hours.util';
import { FEATURE } from '../auth/permissions.constants';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notifications/notification.service';
import { MasterDataService } from '../master-data/master-data.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsDto, RescheduleBookingDto } from './dto/list-bookings.dto';
import { DiscoveryBooking } from './entities/discovery-booking.entity';
import type { BookingStatus } from './entities/discovery-booking.entity';
import { Architect } from './entities/architect.entity';
import { DiscoveryBookingEvent } from './entities/discovery-booking-event.entity';
import type { DiscoveryBookingEventType } from './entities/discovery-booking-event.entity';
import { SessionSlot } from './entities/session-slot.entity';

/**
 * Sessions run on India time, every calendar day, on the hour.
 *
 * One zone rather than per-architect calendars: the desk assigns the architect
 * afterwards, so there is no second zone to reconcile at the moment of booking.
 */
export const SESSION_TIMEZONE = 'Asia/Kolkata';
export const SESSION_FIRST_HOUR = 9;
export const SESSION_LAST_HOUR = 23;

const REFERENCE_PREFIX = 'DC';
const REFERENCE_SEQUENCE = 'discovery_booking_ref_seq';

export interface BookingContext {
  ip?: string;
  userAgent?: string;
}

/**
 * One line in the assign dropdown.
 *
 *   "Data Privacy Architect - Mohommad Suhail"
 *
 * A LINE PER INDUSTRY, not per architect. Somebody covering Data Privacy and
 * Hotel Management appears twice, once under each. The desk arrives at this
 * dropdown knowing the discipline the session needs rather than the person, so
 * a single line naming only their first industry hides them from the search
 * everybody is actually doing.
 *
 * Both lines assign the same architect — `architectId` is the same on each,
 * and the industry is a way of finding them, not a second thing being chosen.
 * `optionId` exists because of that: two lines with the same value would make
 * a `<select>` snap back to the first of them.
 */
export interface AssignmentOption {
  /** Unique per line, since `architectId` is not. */
  optionId: string;
  architectId: string;
  name: string;
  /**
   * What the dropdown reads. Composed here rather than in the panel so the
   * wording has one home. The industry comes first because that is what the
   * desk is choosing on — the name only matters once the discipline is right.
   */
  label: string;
  /** Their designation, so the desk can tell two similar names apart. */
  designation: string;
  /** The industry this line is filed under; null for anybody with none set. */
  industryCode: number | null;
  /**
   * False when they already have something at this hour.
   *
   * Advisory, not a bar: the desk may knowingly double-book, and the
   * alternative — hiding the person — looks like they do not exist.
   */
  free: boolean;
}

export interface BookingResult {
  referenceNo: string;
  manageToken: string;
  startsAt: Date;
  localTime: string;
  /** Null on arrival — assigned later in the admin panel. */
  architect: string | null;
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
    @InjectRepository(Architect)
    private readonly architectRepo: Repository<Architect>,
    @InjectRepository(DiscoveryBookingEvent)
    private readonly eventRepo: Repository<DiscoveryBookingEvent>,
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

  /**
   * The rules every session time obeys, wherever it comes from.
   *
   * Shared by the public form and the desk's reschedule on purpose. Two copies
   * of "on the hour, in hours, in the future" is how one of them ends up
   * allowing 03:17 — and the desk's copy would be the one nobody notices,
   * because no visitor is there to be puzzled by it.
   *
   * Checked rather than trusted even on the admin side: the panel's picker is
   * a convenience, not a guarantee, and an hour that cannot be staffed is no
   * better for having been chosen internally.
   */
  private readSessionTime(
    value: string,
    now: Date,
  ): { startsAt: Date; parts: ReturnType<typeof getZonedParts> } {
    const startsAt = new Date(value);
    if (Number.isNaN(startsAt.getTime())) {
      throw new ConflictException('That date and time could not be read.');
    }
    if (startsAt <= now) {
      throw new ConflictException('That time is in the past.');
    }

    const parts = getZonedParts(startsAt, SESSION_TIMEZONE);
    if (parts.minute !== 0) {
      throw new ConflictException('Sessions start on the hour.');
    }
    if (parts.hour < SESSION_FIRST_HOUR || parts.hour > SESSION_LAST_HOUR) {
      throw new ConflictException(
        `Sessions run between ${SESSION_FIRST_HOUR}:00 and ${SESSION_LAST_HOUR}:00 India time.`,
      );
    }

    return { startsAt, parts };
  }

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

    const { startsAt: requestedStartAt, parts } = this.readSessionTime(
      dto.requestedStartAt,
      now,
    );

    const manageToken = randomBytes(24).toString('hex');

    let booking: DiscoveryBooking;
    try {
      booking = await this.dataSource.transaction(async (manager) => {
        const referenceNo = await this.referenceNumbers.next(
          REFERENCE_PREFIX,
          REFERENCE_SEQUENCE,
          manager,
        );

        return manager.save(
          manager.create(DiscoveryBooking, {
            referenceNo,
            siteCode,
            requestedStartAt,
            // Both assigned later, in the admin panel, with the practice.
            slotId: null,
            architectId: null,
            fullName: dto.fullName,
            company: dto.company,
            roleTitle: dto.roleTitle,
            workEmail: dto.workEmail,
            phone: joinPhone(dto.phoneCode, dto.phone),
            programme: dto.programme,
            requiresNda: dto.requiresNda ?? false,
            attendeeTimezone: dto.timezone ?? SESSION_TIMEZONE,
            consentAt: now,
            privacyNoticeVersion: this.config.getOrThrow<string>(
              'PRIVACY_NOTICE_VERSION',
            ),
            status: 'REQUESTED',
            manageToken,
            sourcePage: dto.sourcePage ?? null,
            ipHash: this.spamCheck.hashIp(context.ip),
            userAgent: context.userAgent ?? null,
            spamScore: spam.score,
          }),
        );

        /*
         * The first entry, written here rather than after the commit: if the
         * booking rolls back there was no booking to have a history.
         */
        await manager.save(
          manager.create(DiscoveryBookingEvent, {
            bookingId: booking.id,
            eventType: 'CREATED',
            actor: null,
            note: 'Requested from the website.',
            metadata: {
              requestedStartAt: booking.requestedStartAt,
              attendeeTimezone: booking.attendeeTimezone,
            },
          }),
        );
      });
    } catch (error) {
      /*
       * One booking per time, and the partial unique index is what enforces it.
       *
       * Two people confirming the same hour at the same moment both pass any
       * read-then-write check, so the collision is caught here instead: 23505
       * is Postgres's unique_violation, and on this table the only unique it
       * can be racing is the one-per-time index.
       */
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          'That time was just taken. Please choose another.',
        );
      }
      throw error;
    }

    const localTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;

    await this.sendRequestReceived(booking, localTime);

    /*
     * The panel's bell. It used to name the architect; there is none yet, so it
     * says what the desk now has to do instead — this booking is waiting on
     * somebody choosing a practice and an architect for it.
     */
    await this.notifications.raise({
      siteCode,
      featureCode: FEATURE.IT_DISCOVERY,
      category: 'architect',
      lead: 'Architect request — needs assigning',
      body: `${booking.fullName} · ${booking.company} · ${localTime} India time`,
      link: `/architect/${booking.id}`,
      sourceType: 'discovery_booking',
      sourceId: booking.id,
    });

    return {
      referenceNo: booking.referenceNo,
      manageToken: booking.manageToken,
      startsAt: booking.requestedStartAt,
      localTime,
      architect: null,
      /*
       * Deliberately not "your session is confirmed".
       *
       * Nobody is assigned yet and no invite exists, so promising one would be
       * the same false confirmation the careers pop-up used to show. This says
       * what is actually true and what happens next.
       */
      message:
        'Thank you — we have your request. We will confirm the session and send your calendar invite shortly.',
    };
  }

  /** The attendee's own view — no account, just the token from their email. */
  async findByToken(
    token: string,
    siteCode: number,
  ): Promise<DiscoveryBooking> {
    const booking = await this.bookingRepo.findOne({
      where: { manageToken: token, isDeleted: false, siteCode },
      relations: { slot: true, architect: { industries: true } },
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

      await manager.save(
        manager.create(DiscoveryBookingEvent, {
          bookingId: booking.id,
          eventType: 'CANCELLED_BY_ATTENDEE',
          actor: null,
          note: 'Cancelled by the attendee from their manage link.',
          metadata: { from: booking.status },
        }),
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
      .leftJoinAndSelect('architect.industries', 'industry')
      .where('booking.isDeleted = false')
      .andWhere('booking.siteCode = :siteCode', { siteCode });

    if (query.status) {
      qb.andWhere('booking.status = :status', { status: query.status });
    }
    if (query.industryCode !== undefined) {
      // EXISTS rather than filtering the joined rows, so a booking with an
      // architect covering several industries still returns the full list.
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM architect_industries ai
           WHERE ai.architect_id = booking.architect_id
             AND ai.industry_code = :industryCode
         )`,
        { industryCode: query.industryCode },
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
     *
     * `requestedStartAt`, not the slot. A slot exists only once somebody has
     * been assigned, and NULL fails every comparison silently — so reading the
     * hour off the slot made any date window drop every unassigned request,
     * which is exactly the set this desk still has work to do on.
     */
    if (query.from) {
      qb.andWhere('booking.requestedStartAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('booking.requestedStartAt <= :to', { to: query.to });
    }

    const [items, total] = await qb
      .orderBy(
        'booking.requestedStartAt',
        query.sort === 'soonest' ? 'ASC' : 'DESC',
      )
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
      // Both withheld from the list by `select: false` and released here:
      // a direct line to a named person is contact data, and the brief is
      // theirs rather than ours to spray across a table.
      .addSelect(['booking.programme', 'booking.phone'])
      .leftJoinAndSelect('booking.slot', 'slot')
      .leftJoinAndSelect('booking.architect', 'architect')
      // Industries too, so one booking has the same shape here as in the list.
      // Without it `architect.industries` is undefined on the detail alone —
      // the kind of difference a caller cannot see until it breaks at runtime.
      .leftJoinAndSelect('architect.industries', 'industry')
      .where('booking.id = :id', { id })
      .andWhere('booking.isDeleted = false')
      .andWhere('booking.siteCode = :siteCode', { siteCode })
      .getOne();

    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return booking;
  }

  /**
   * Record the outcome of a session.
   *
   * BOOKED is the one status this cannot simply be set to while the session
   * has nobody on it. "Booked" is a promise to the attendee that somebody is
   * turning up, and the thing that makes it true is an architect — so the
   * confirmation lives in `assign`, which flips a REQUESTED session to BOOKED
   * as part of giving it to someone, and emails them who they are meeting.
   *
   * Allowing it here as well would let the desk mark a session confirmed with
   * nobody assigned to it: the panel would read Booked, no invite would ever
   * have gone out, and the attendee would be waiting for a call that has no
   * architect behind it. The error text is written to be shown to whoever
   * picked it, because it is a prompt rather than a failure — the next step
   * is one control away.
   *
   * A session that already has an architect may be set back to BOOKED freely;
   * correcting a wrong outcome is not the same act.
   */
  async setStatus(
    id: string,
    status: BookingStatus,
    actor: string,
    siteCode: number,
  ): Promise<DiscoveryBooking> {
    const booking = await this.findById(id, siteCode);

    if (status === 'BOOKED' && !booking.architectId) {
      throw new ConflictException(
        'Choose an architect to confirm this booking. Assigning one marks the session Booked and emails the attendee.',
      );
    }

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

      /* Both ends recorded: "Booked -> No-show" is the readable fact, and
         the row itself keeps only the second half of it. */
      await manager.save(
        manager.create(DiscoveryBookingEvent, {
          bookingId: id,
          eventType: 'STATUS_CHANGED',
          actor,
          note: null,
          metadata: { from: booking.status, to: status },
        }),
      );
    });

    return this.findById(id, siteCode);
  }

  /** The timeline, oldest first — it is read as a story. */
  async listEvents(
    id: string,
    siteCode: number,
  ): Promise<DiscoveryBookingEvent[]> {
    await this.findById(id, siteCode);
    return this.eventRepo.find({
      where: { bookingId: id },
      order: { createdDate: 'ASC' },
    });
  }

  /**
   * Append an internal note.
   *
   * Internal in the strict sense: it goes nowhere near the attendee, and no
   * email is sent. Append-only, because a note somebody can quietly rewrite
   * is worth less than no note at all.
   */
  async addNote(
    id: string,
    note: string,
    actor: string,
    siteCode: number,
  ): Promise<DiscoveryBookingEvent> {
    await this.findById(id, siteCode);
    return this.eventRepo.save(
      this.eventRepo.create({
        bookingId: id,
        eventType: 'NOTE_ADDED' as DiscoveryBookingEventType,
        actor,
        note: note.trim(),
        metadata: null,
      }),
    );
  }

  /**
   * The hours already held on one India-time day.
   *
   * The day's bounds are built from its India-time midnight rather than from
   * the server's own, so the answer does not shift with where this runs.
   * Cancelled bookings are excluded — a cancellation puts the hour back.
   */
  async takenHours(
    date: string,
    siteCode: number,
  ): Promise<{ date: string; taken: string[] }> {
    const dayStart = new Date(`${date.slice(0, 10)}T00:00:00+05:30`);
    if (Number.isNaN(dayStart.getTime())) {
      throw new ConflictException('That date could not be read.');
    }
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const held = await this.bookingRepo.find({
      where: {
        siteCode,
        isDeleted: false,
        status: Not(In(['CANCELLED'])),
        requestedStartAt: Between(dayStart, dayEnd),
      },
      select: ['requestedStartAt'],
    });

    const taken = held
      .map((b) => {
        const parts = getZonedParts(b.requestedStartAt, SESSION_TIMEZONE);
        return `${String(parts.hour).padStart(2, '0')}:00`;
      })
      .sort();

    return { date: date.slice(0, 10), taken: [...new Set(taken)] };
  }

  // -----------------------------------------------------------------------
  // Assignment
  // -----------------------------------------------------------------------

  /**
   * Who the desk can give this session to.
   *
   * Every active architect, with a flag for whether they already have
   * something at that hour. Nobody is filtered out: the desk decides, and an
   * architect hidden because they look busy is indistinguishable from one who
   * does not exist.
   *
   * One line per industry, so somebody covering two appears under both — see
   * AssignmentOption. Ordered by industry rather than by name, because that
   * puts every Data Privacy architect together, which is how the list is read.
   */
  async assignmentOptions(
    id: string,
    siteCode: number,
  ): Promise<AssignmentOption[]> {
    const booking = await this.findById(id, siteCode);

    const architects = await this.architectRepo.find({
      // `isDeleted` as well as `isActive`: somebody taken off the roster is
      // not a candidate, and this list was the one place still offering them.
      where: { siteCode, isActive: true, isDeleted: false },
      relations: { industries: true },
      order: { fullName: 'ASC', designation: 'ASC' },
    });

    const busy = await this.bookingRepo.find({
      where: {
        siteCode,
        requestedStartAt: booking.requestedStartAt,
        status: Not(In(['CANCELLED'])),
        isDeleted: false,
      },
      select: ['architectId'],
    });
    const taken = new Set(busy.map((b) => b.architectId).filter(Boolean));

    const lines: AssignmentOption[] = [];
    for (const a of architects) {
      const name = a.fullName ?? a.designation;
      const base = {
        architectId: a.id,
        name,
        designation: a.designation,
        free: !taken.has(a.id),
      };

      if ((a.industries ?? []).length === 0) {
        /*
         * One line, their bare name. Writing "Architect - Md Faiz" with
         * nothing in front would invent a discipline for them, and the gap is
         * what should prompt somebody to go and record one.
         */
        lines.push({
          ...base,
          optionId: `${a.id}:none`,
          label: name,
          industryCode: null,
        });
        continue;
      }

      for (const i of a.industries) {
        lines.push({
          ...base,
          optionId: `${a.id}:${i.industryCode}`,
          label: `${i.industryName} Architect - ${name}`,
          industryCode: i.industryCode,
        });
      }
    }

    /*
     * Industry first, then name, in the master's own display order rather
     * than whatever order the join returned — a list that reshuffles between
     * page loads looks like the data changed. Architects with no industry sort
     * last: they are the records somebody still has to finish.
     */
    const order = new Map<number, number>();
    for (const a of architects) {
      for (const i of a.industries ?? [])
        order.set(i.industryCode, i.displayOrder);
    }
    const rank = (c: number | null) =>
      c === null
        ? Number.MAX_SAFE_INTEGER
        : (order.get(c) ?? Number.MAX_SAFE_INTEGER);

    return lines.sort(
      (x, y) =>
        rank(x.industryCode) - rank(y.industryCode) ||
        x.name.localeCompare(y.name),
    );
  }

  /**
   * Give a session an architect, and a practice.
   *
   * The one assignment action: it works on a REQUESTED booking that has
   * nobody, and on a BOOKED one whose architect has to change. There is no
   * separate "reassign" — the difference between the two was never more than
   * whether a previous architect existed, and the panel offers one button
   * either way.
   *
   * The hour never moves here. The attendee chose it around their own diary,
   * so if nobody can take it the answer is to agree another time with them —
   * and `reschedule` is where that agreement gets recorded, with its own
   * letter. Assigning must never move a session as a side effect.
   */
  async assign(
    id: string,
    architectId: string,
    actor: string,
    siteCode: number,
  ): Promise<DiscoveryBooking> {
    const booking = await this.findById(id, siteCode);

    const architect = await this.architectRepo.findOne({
      where: { id: architectId, siteCode, isActive: true },
    });
    if (!architect) {
      throw new NotFoundException('No such architect on this site');
    }

    const wasAssigned = booking.architectId !== null;

    /*
     * Only a request becomes BOOKED.
     *
     * A session that is already completed, cancelled or marked no-show has an
     * outcome, and naming who took it does not undo that. Forcing BOOKED here
     * would quietly reopen a closed record every time somebody corrected the
     * architect on it.
     */
    const status = booking.status === 'REQUESTED' ? 'BOOKED' : booking.status;

    await this.bookingRepo.update({ id }, { architectId, status });

    await this.eventRepo.save(
      this.eventRepo.create({
        bookingId: id,
        eventType: 'ASSIGNED',
        actor,
        note: null,
        metadata: {
          to: architect.fullName ?? architect.designation,
          toId: architectId,
          from: booking.architect?.fullName ?? null,
          fromId: booking.architectId,
          reassignment: wasAssigned,
        },
      }),
    );

    const updated = await this.findById(id, siteCode);

    /*
     * The attendee hears about it only when there is still something to attend.
     *
     * The confirmation goes out the first time; a later change is an update to
     * something they already hold. Neither applies to a session that has already
     * happened or been cancelled — telling somebody who their architect "will
     * be" for a call last Tuesday is noise at best, and alarming at worst.
     */
    const stillAhead =
      updated.status !== 'CANCELLED' && updated.requestedStartAt > new Date();
    if (stillAhead) {
      await this.sendAssignment(updated, architect, wasAssigned);
    }

    return updated;
  }

  // -----------------------------------------------------------------------
  // Rescheduling
  // -----------------------------------------------------------------------

  /**
   * Move a session to another hour.
   *
   * Separate from `assign` deliberately. Changing the architect is internal
   * housekeeping the attendee is merely told about; changing the hour takes
   * something out of their diary and puts it somewhere else, and conflating
   * the two would let a reassignment quietly move a meeting.
   *
   * Three things make it safe to expose:
   *
   *  - the new time passes exactly the rules the public form passes, so the
   *    desk cannot book an hour the business does not staff;
   *  - the one-per-time index applies to updates as much as inserts, so moving
   *    onto a taken hour is refused rather than double-booked;
   *  - the attendee is written to every time, naming both hours.
   *
   * Only a session that is still ahead of us can move. A completed or
   * no-showed one has already happened, and a cancelled one is not a session
   * any more — "rescheduling" any of those would be rewriting history rather
   * than arranging anything, and the attendee would get a letter about a
   * meeting they know is over.
   */
  async reschedule(
    id: string,
    dto: RescheduleBookingDto,
    actor: string,
    siteCode: number,
  ): Promise<DiscoveryBooking> {
    const booking = await this.findById(id, siteCode);
    const now = new Date();

    if (booking.status === 'COMPLETED' || booking.status === 'NO_SHOW') {
      throw new ConflictException(
        'That session has already happened. Book a new one instead.',
      );
    }
    if (booking.status === 'CANCELLED') {
      throw new ConflictException(
        'That session was cancelled. Book a new one instead.',
      );
    }
    if (booking.requestedStartAt <= now) {
      throw new ConflictException(
        'That session time has already passed. Book a new one instead.',
      );
    }

    const { startsAt, parts } = this.readSessionTime(dto.requestedStartAt, now);

    const from = booking.requestedStartAt;
    if (startsAt.getTime() === from.getTime()) {
      throw new ConflictException('That is the time it is already booked for.');
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          DiscoveryBooking,
          { id },
          {
            requestedStartAt: startsAt,
            /*
             * A moved session needs its invite sending again. Clearing this
             * is what stops the panel reporting an invite that was issued for
             * an hour nobody is meeting at any more.
             */
            inviteSentAt: null,
          },
        );

        await manager.save(
          manager.create(DiscoveryBookingEvent, {
            bookingId: id,
            eventType: 'RESCHEDULED',
            actor,
            note: dto.reason ?? null,
            metadata: {
              from: from.toISOString(),
              to: startsAt.toISOString(),
            },
          }),
        );
      });
    } catch (error) {
      // Same unique index as a new booking, and the same answer: the hour is
      // held by somebody else, so offer another rather than overwrite them.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          'That time is already taken. Please choose another.',
        );
      }
      throw error;
    }

    const updated = await this.findById(id, siteCode);
    await this.sendReschedule(updated, from, parts, dto.reason);

    return updated;
  }

  /**
   * Tell the attendee their session has moved.
   *
   * Both hours, in that order, because "it moved" is useless without knowing
   * which of the two dates in their diary is the live one. Sent even when the
   * change was agreed on a call — the written version is what they can find
   * again later.
   */
  private async sendReschedule(
    booking: DiscoveryBooking,
    from: Date,
    parts: ReturnType<typeof getZonedParts>,
    reason?: string,
  ): Promise<void> {
    const was = getZonedParts(from, SESSION_TIMEZONE);
    const format = (p: ReturnType<typeof getZonedParts>) =>
      `${p.day}/${p.month}/${p.year} at ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')} India time`;

    const architectName =
      booking.architect?.fullName ?? booking.architect?.designation ?? null;

    await this.mail.send({
      to: booking.workEmail,
      subject: `Your session has moved — ${booking.referenceNo}`,
      body: [
        `Hello ${booking.fullName},`,
        ``,
        `Your discovery session has been moved.`,
        ``,
        `Was:  ${format(was)}`,
        `Now:  ${format(parts)}`,
        ...(architectName ? [`Architect: ${architectName}`] : []),
        `Reference: ${booking.referenceNo}`,
        ``,
        ...(reason ? [reason, ``] : []),
        // Said plainly, because a moved meeting is exactly when somebody
        // needs to know they can push back.
        `If the new time does not work, reply to this email and we will find`,
        `one that does.`,
        ``,
        `View or cancel: /talk-to-architect/booking/${booking.manageToken}`,
      ].join('\n'),
    });
  }

  /**
   * Tell the attendee who they are meeting.
   *
   * Two different letters from one place, because they are two different
   * events. The first assignment is the confirmation the request email
   * promised; a later change is an update to an arrangement they already hold,
   * where nothing except the name has altered and they need do nothing.
   */
  private async sendAssignment(
    booking: DiscoveryBooking,
    architect: Architect,
    wasAssigned: boolean,
  ): Promise<void> {
    const parts = getZonedParts(booking.requestedStartAt, SESSION_TIMEZONE);
    const localTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    const when = `${parts.day}/${parts.month}/${parts.year} at ${localTime} India time`;
    const name = architect.fullName ?? architect.designation;

    await this.mail.send({
      to: booking.workEmail,
      subject: wasAssigned
        ? `A change of architect — ${booking.referenceNo}`
        : `Discovery session confirmed — ${booking.referenceNo}`,
      body: (wasAssigned
        ? [
            `Hello ${booking.fullName},`,
            ``,
            `Your session on ${when} is unchanged — only the architect has.`,
            ``,
            `You will now be meeting ${name}.`,
            ``,
            `The time, the reference and your link all stay the same, so there`,
            `is nothing you need to do.`,
          ]
        : [
            `Hello ${booking.fullName},`,
            ``,
            `Your 45-minute discovery session is confirmed.`,
            ``,
            `When:      ${when}`,
            `Architect: ${name}`,
            `Reference: ${booking.referenceNo}`,
            ``,
            `The session runs to a 10 / 25 / 10 format — context, architecture,`,
            `next steps. You will receive an architectural memo, regulatory`,
            `checklist and scoping table within two business days afterwards.`,
          ]
      )
        .concat([
          ``,
          `To view or cancel: /talk-to-architect/booking/${booking.manageToken}`,
        ])
        .join('\n'),
    });
  }

  /**
   * What the visitor gets the moment a request arrives.
   *
   * Not a confirmation: no architect has been assigned and no invite exists
   * yet, so it says the request was received and that the invite follows. The
   * real confirmation goes out when the desk assigns somebody.
   */
  private async sendRequestReceived(
    booking: DiscoveryBooking,
    localTime: string,
  ): Promise<void> {
    const parts = getZonedParts(booking.requestedStartAt, SESSION_TIMEZONE);
    const when = `${parts.day}/${parts.month}/${parts.year} at ${localTime} India time`;

    await this.mail.send({
      to: booking.workEmail,
      subject: `We have your session request — ${booking.referenceNo}`,
      body: [
        `Hello ${booking.fullName},`,
        ``,
        `Thank you — we have your request for a 45-minute discovery session.`,
        ``,
        `Requested: ${when}`,
        `Reference: ${booking.referenceNo}`,
        ``,
        `We are matching you with the right architect. You will get a calendar`,
        `invite with their name and credentials once that is done — if the time`,
        `you asked for turns out not to work, we will offer you the nearest`,
        `alternative rather than move you without asking.`,
        ``,
        `View or cancel this request at any time:`,
        `/talk-to-architect/booking/${booking.manageToken}`,
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
