import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { toIsoDate, zonedTimeToUtc } from '../common/utils/business-hours.util';
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

  /*
   * GONE: availability(), slotsForDay() and findArchitectsForPractice().
   *
   * All three answered "when is the architect for this practice free?", which
   * nobody asks any more: the visitor picks an hour and the desk assigns
   * afterwards. They read the architect-to-practice link that no longer
   * exists, so leaving them would have left three methods that compile and
   * throw — which is exactly how the booking list broke.
   */

  private assertTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException(`Unknown timezone: ${timezone}`);
    }
  }
}
