import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import {
  getZonedParts,
  toIsoDate,
  zonedTimeToUtc,
} from '../common/utils/business-hours.util';
import { ArchitectAvailabilityRule } from './entities/architect-availability-rule.entity';
import { ArchitectBlackout } from './entities/architect-blackout.entity';
import { Architect } from './entities/architect.entity';
import { SESSION_MINUTES, SessionSlot } from './entities/session-slot.entity';

export type AvailabilityDensity =
  'WIDE' | 'SOME' | 'LIMITED' | 'FULLY_BOOKED' | 'UNAVAILABLE';

export interface DayAvailability {
  /** The visitor's local date, `YYYY-MM-DD`. */
  date: string;
  freeSlots: number;
  totalSlots: number;
  density: AvailabilityDensity;
}

export interface SlotOption {
  id: string;
  /** UTC instant — the frontend renders it in the visitor's timezone. */
  startsAt: Date;
  endsAt: Date;
  /** Pre-rendered in the requested timezone, for emails and non-browser clients. */
  localTime: string;
  durationMinutes: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Thresholds behind the page's four availability labels. */
function densityFor(free: number, total: number): AvailabilityDensity {
  if (total === 0) return 'UNAVAILABLE';
  if (free === 0) return 'FULLY_BOOKED';
  if (free <= 2) return 'LIMITED';
  if (free <= 5) return 'SOME';
  return 'WIDE';
}

@Injectable()
export class SlotService {
  private readonly logger = new Logger(SlotService.name);

  constructor(
    @InjectRepository(SessionSlot)
    private readonly slotRepo: Repository<SessionSlot>,
    @InjectRepository(Architect)
    private readonly architectRepo: Repository<Architect>,
    @InjectRepository(ArchitectAvailabilityRule)
    private readonly ruleRepo: Repository<ArchitectAvailabilityRule>,
    @InjectRepository(ArchitectBlackout)
    private readonly blackoutRepo: Repository<ArchitectBlackout>,
  ) {}

  // -----------------------------------------------------------------------
  // Generation
  // -----------------------------------------------------------------------

  /**
   * Materialises slots for every active architect between two dates.
   *
   * Idempotent: the unique constraint on (architect, startsAt) means re-running
   * over an overlapping window inserts nothing new, so a cron can safely roll
   * the window forward without tracking what it already produced.
   */
  async generate(
    fromIso: string,
    toIso: string,
    siteCode: number,
  ): Promise<{ created: number; skipped: number }> {
    const from = new Date(`${fromIso}T00:00:00Z`);
    const to = new Date(`${toIso}T00:00:00Z`);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to < from
    ) {
      throw new BadRequestException('Invalid generation window');
    }

    // Only this brand's architects — generating across every brand would fill
    // one business's calendar with another's sessions.
    const architects = await this.architectRepo.find({
      where: { isActive: true, isDeleted: false, siteCode },
    });
    const rules = await this.ruleRepo.find({
      where: { isActive: true, architectId: In(architects.map((a) => a.id)) },
    });
    const blackouts = await this.blackoutRepo.find();

    const candidates: Array<Partial<SessionSlot>> = [];

    for (const rule of rules) {
      // Walk the window a calendar day at a time, in the rule's own timezone.
      for (let t = from.getTime(); t <= to.getTime(); t += MS_PER_DAY) {
        const day = new Date(t);
        if (day.getUTCDay() !== rule.weekday) continue;

        const dateIso = toIsoDate(day);
        if (dateIso < rule.effectiveFrom) continue;
        if (rule.effectiveTo && dateIso > rule.effectiveTo) continue;

        const [y, m, d] = dateIso.split('-').map(Number);

        // Step in minutes: 45-minute sessions do not align to hour boundaries,
        // so 09:00–18:00 yields 09:00, 09:45, 10:30 … 17:15 — twelve slots.
        const windowStart = rule.startHour * 60;
        const windowEnd = rule.endHour * 60;

        for (
          let minutes = windowStart;
          minutes + SESSION_MINUTES <= windowEnd;
          minutes += SESSION_MINUTES
        ) {
          const startsAt = zonedTimeToUtc(
            y,
            m,
            d,
            Math.floor(minutes / 60),
            minutes % 60,
            rule.timezone,
          );
          const endsAt = new Date(
            startsAt.getTime() + SESSION_MINUTES * 60_000,
          );

          const blocked = blackouts.find(
            (b) =>
              (b.architectId === null || b.architectId === rule.architectId) &&
              startsAt < b.endsAt &&
              endsAt > b.startsAt,
          );

          candidates.push({
            architectId: rule.architectId,
            siteCode,
            startsAt,
            endsAt,
            status: blocked ? 'BLOCKED' : 'FREE',
            blockedReason: blocked ? blocked.reason : null,
          });
        }
      }
    }

    if (candidates.length === 0) return { created: 0, skipped: 0 };

    // Counting either side is more reliable than reading identifiers back from
    // an ON CONFLICT DO NOTHING insert, which reports them inconsistently.
    const before = await this.slotRepo.count();

    // Chunked: a single insert of several thousand rows exceeds the parameter
    // limit Postgres accepts in one statement.
    for (let i = 0; i < candidates.length; i += 500) {
      await this.slotRepo
        .createQueryBuilder()
        .insert()
        .into(SessionSlot)
        .values(candidates.slice(i, i + 500))
        .orIgnore()
        .execute();
    }

    const created = (await this.slotRepo.count()) - before;
    this.logger.log(
      `Slot generation ${fromIso}..${toIso}: ${created} created, ${candidates.length - created} already present`,
    );
    return { created, skipped: candidates.length - created };
  }

  // -----------------------------------------------------------------------
  // Availability
  // -----------------------------------------------------------------------

  /**
   * Per-day density for the calendar grid, grouped in the VISITOR's timezone.
   *
   * This is the subtle part: a slot at 09:00 Riyadh is the previous calendar day
   * for a visitor in Los Angeles. Grouping by the KSA date would file it under
   * the wrong day, so the range is widened by a day either side and every slot
   * is bucketed by its local date for the requested zone.
   */
  async availability(
    practiceCode: number,
    fromIso: string,
    toIso: string,
    timezone: string,
    siteCode: number,
  ): Promise<DayAvailability[]> {
    this.assertTimezone(timezone);

    const architects = await this.findArchitectsForPractice(
      practiceCode,
      siteCode,
    );
    if (architects.length === 0) return [];

    // A day of slack each side absorbs the offset between zones.
    const rangeStart = new Date(
      new Date(`${fromIso}T00:00:00Z`).getTime() - MS_PER_DAY,
    );
    const rangeEnd = new Date(
      new Date(`${toIso}T00:00:00Z`).getTime() + 2 * MS_PER_DAY,
    );

    const slots = await this.slotRepo.find({
      where: {
        architectId: In(architects.map((a) => a.id)),
        startsAt: Between(rangeStart, rangeEnd),
      },
    });

    const buckets = new Map<string, { free: number; total: number }>();
    for (const slot of slots) {
      const p = getZonedParts(slot.startsAt, timezone);
      const localDate = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
      if (localDate < fromIso || localDate > toIso) continue;

      const bucket = buckets.get(localDate) ?? { free: 0, total: 0 };
      bucket.total += 1;
      if (slot.status === 'FREE' && slot.startsAt > new Date())
        bucket.free += 1;
      buckets.set(localDate, bucket);
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { free, total }]) => ({
        date,
        freeSlots: free,
        totalSlots: total,
        density: densityFor(free, total),
      }));
  }

  /**
   * Bookable times on one day.
   *
   * `dateIso` is the VISITOR's local date, not KSA's — the same convention as
   * the calendar grid, so clicking a cell and listing its slots agree.
   */
  async slotsForDay(
    practiceCode: number,
    dateIso: string,
    timezone: string,
    siteCode: number,
  ): Promise<SlotOption[]> {
    this.assertTimezone(timezone);

    const architects = await this.findArchitectsForPractice(
      practiceCode,
      siteCode,
    );
    if (architects.length === 0) return [];

    const rangeStart = new Date(
      new Date(`${dateIso}T00:00:00Z`).getTime() - MS_PER_DAY,
    );
    const rangeEnd = new Date(
      new Date(`${dateIso}T00:00:00Z`).getTime() + 2 * MS_PER_DAY,
    );

    const slots = await this.slotRepo.find({
      where: {
        architectId: In(architects.map((a) => a.id)),
        status: 'FREE',
        startsAt: Between(rangeStart, rangeEnd),
      },
      order: { startsAt: 'ASC' },
    });

    const now = new Date();
    return slots
      .filter((slot) => {
        if (slot.startsAt <= now) return false;
        const p = getZonedParts(slot.startsAt, timezone);
        const local = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
        return local === dateIso;
      })
      .map((slot) => {
        const p = getZonedParts(slot.startsAt, timezone);
        return {
          id: slot.id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          localTime: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
          durationMinutes: SESSION_MINUTES,
        };
      });
  }

  /**
   * Architects covering a practice.
   *
   * A join rather than a column lookup — an architect may cover several
   * practices, so a practice's availability is the union of everyone who
   * serves it.
   */
  /**
   * The anchor for both public slot queries. Slots belong to architects, and
   * architects belong to a brand — so scoping this scopes availability and the
   * day view together, without site filters scattered through the date maths.
   */
  private findArchitectsForPractice(
    practiceCode: number,
    siteCode: number,
  ): Promise<Architect[]> {
    return this.architectRepo
      .createQueryBuilder('architect')
      .innerJoin('architect.practices', 'practice')
      .where('practice.practiceCode = :practiceCode', { practiceCode })
      .andWhere('architect.isActive = true')
      .andWhere('architect.isDeleted = false')
      .andWhere('architect.siteCode = :siteCode', { siteCode })
      .getMany();
  }

  private assertTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException(`Unknown timezone: ${timezone}`);
    }
  }
}
