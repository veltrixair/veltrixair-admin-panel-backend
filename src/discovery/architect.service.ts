import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { DiscoveryPracticeMaster } from '../master-data/entities/discovery-practice-master.entity';
import { OfficeMaster } from '../master-data/entities/office-master.entity';
import {
  AssignPracticesDto,
  CreateArchitectDto,
  CreateBlackoutDto,
  ReplaceAvailabilityDto,
  UpdateArchitectDto,
} from './dto/upsert-architect.dto';
import { ArchitectAvailabilityRule } from './entities/architect-availability-rule.entity';
import { ArchitectBlackout } from './entities/architect-blackout.entity';
import { Architect } from './entities/architect.entity';
import { DiscoveryBooking } from './entities/discovery-booking.entity';
import { SessionSlot } from './entities/session-slot.entity';

export interface BlackoutConflict {
  bookingId: string;
  referenceNo: string;
  company: string;
  startsAt: Date;
}

@Injectable()
export class ArchitectService {
  constructor(
    @InjectRepository(Architect)
    private readonly architectRepo: Repository<Architect>,
    @InjectRepository(ArchitectAvailabilityRule)
    private readonly ruleRepo: Repository<ArchitectAvailabilityRule>,
    @InjectRepository(ArchitectBlackout)
    private readonly blackoutRepo: Repository<ArchitectBlackout>,
    @InjectRepository(SessionSlot)
    private readonly slotRepo: Repository<SessionSlot>,
    @InjectRepository(DiscoveryBooking)
    private readonly bookingRepo: Repository<DiscoveryBooking>,
    @InjectRepository(DiscoveryPracticeMaster)
    private readonly practiceRepo: Repository<DiscoveryPracticeMaster>,
    @InjectRepository(OfficeMaster)
    private readonly officeRepo: Repository<OfficeMaster>,
  ) {}

  // -----------------------------------------------------------------------
  // Architects
  // -----------------------------------------------------------------------

  list(includeInactive = false, siteCode: number): Promise<Architect[]> {
    return this.architectRepo.find({
      where: includeInactive
        ? { isDeleted: false, siteCode }
        : { isDeleted: false, isActive: true, siteCode },
      relations: { practices: true, office: true },
      order: { createdDate: 'ASC' },
    });
  }

  /**
   * The choke point. Availability, blackouts, practices and deactivation all
   * read through here, so binding the brand once binds every one of them.
   */
  async findById(id: string, siteCode: number): Promise<Architect> {
    const architect = await this.architectRepo.findOne({
      where: { id, isDeleted: false, siteCode },
      relations: { practices: true, office: true },
    });
    if (!architect) throw new NotFoundException(`Architect ${id} not found`);
    return architect;
  }

  async create(dto: CreateArchitectDto, siteCode: number): Promise<Architect> {
    const practices = await this.resolvePractices(dto.practiceCodes);
    await this.assertOfficeExists(dto.officeCode);

    const existing = await this.architectRepo.findOne({
      where: { slug: dto.slug, siteCode },
    });
    if (existing) {
      throw new BadRequestException(
        `An architect with slug "${dto.slug}" already exists`,
      );
    }

    const saved = await this.architectRepo.save(
      this.architectRepo.create({
        siteCode,
        slug: dto.slug,
        fullName: dto.fullName ?? null,
        displayTitle: dto.displayTitle,
        credentials: dto.credentials ?? null,
        practices,
        officeCode: dto.officeCode,
        isActive: dto.isActive ?? true,
      }),
    );
    return this.findById(saved.id, siteCode);
  }

  async update(
    id: string,
    dto: UpdateArchitectDto,
    siteCode: number,
  ): Promise<Architect> {
    const architect = await this.findById(id, siteCode);

    if (dto.officeCode !== undefined) {
      await this.assertOfficeExists(dto.officeCode);
    }
    if (dto.slug && dto.slug !== architect.slug) {
      const clash = await this.architectRepo.findOne({
        where: { slug: dto.slug },
      });
      if (clash && clash.id !== id) {
        throw new BadRequestException(
          `An architect with slug "${dto.slug}" already exists`,
        );
      }
    }

    await this.architectRepo.update(
      { id },
      {
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.displayTitle !== undefined && {
          displayTitle: dto.displayTitle,
        }),
        ...(dto.credentials !== undefined && { credentials: dto.credentials }),
        ...(dto.officeCode !== undefined && { officeCode: dto.officeCode }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    );

    // The join table is a relation, so it is written separately from the columns.
    if (dto.practiceCodes) {
      const practices = await this.resolvePractices(dto.practiceCodes);
      await this.setPracticeRows(
        id,
        practices.map((p) => p.practiceCode),
      );
    }

    return this.findById(id, siteCode);
  }

  /**
   * Replace the set of practices an architect covers.
   *
   * Slots belong to the architect rather than the practice, so their whole
   * calendar follows the assignment — practices dropped from the set lose that
   * availability, practices added gain it, and no slot is rewritten. Existing
   * bookings are unaffected: they reference the architect, and the attendee
   * still meets the same person.
   */
  async assignPractices(
    id: string,
    dto: AssignPracticesDto,
    siteCode: number,
  ): Promise<{
    architect: Architect;
    added: number[];
    removed: number[];
    affectedSlots: number;
    upcomingBookings: number;
  }> {
    const architect = await this.findById(id, siteCode);
    const practices = await this.resolvePractices(dto.practiceCodes);

    const before = (architect.practices ?? []).map((p) => p.practiceCode);
    const after = practices.map((p) => p.practiceCode);
    const added = after.filter((c) => !before.includes(c));
    const removed = before.filter((c) => !after.includes(c));

    if (added.length === 0 && removed.length === 0) {
      throw new BadRequestException(
        'That architect already covers exactly these practices',
      );
    }

    const now = new Date();
    const affectedSlots = await this.slotRepo.count({
      where: { architectId: id, startsAt: MoreThan(now) },
    });
    const upcomingBookings = await this.bookingRepo
      .createQueryBuilder('booking')
      .innerJoin('booking.slot', 'slot')
      .where('booking.architectId = :id', { id })
      .andWhere('booking.status = :status', { status: 'BOOKED' })
      .andWhere('slot.startsAt > now()')
      .getCount();

    await this.setPracticeRows(id, after);

    return {
      architect: await this.findById(id, siteCode),
      added,
      removed,
      affectedSlots,
      upcomingBookings,
    };
  }

  /**
   * Replaces the join rows for an architect.
   *
   * Written directly rather than through `save()` on the relation: TypeORM
   * re-inserts the whole set instead of diffing it, which collides with the
   * composite primary key on rows that already exist.
   */
  private async setPracticeRows(
    architectId: string,
    practiceCodes: number[],
  ): Promise<void> {
    await this.architectRepo.manager.transaction(async (manager) => {
      await manager.query(
        'DELETE FROM architect_practices WHERE architect_id = $1',
        [architectId],
      );
      if (practiceCodes.length > 0) {
        await manager.query(
          `INSERT INTO architect_practices (architect_id, practice_code)
           SELECT $1, unnest($2::int[])`,
          [architectId, practiceCodes],
        );
      }
    });
  }

  /** Deactivating hides an architect from booking without touching history. */
  async deactivate(id: string, siteCode: number): Promise<{ message: string }> {
    await this.findById(id, siteCode);

    const upcoming = await this.bookingRepo
      .createQueryBuilder('booking')
      .innerJoin('booking.slot', 'slot')
      .where('booking.architectId = :id', { id })
      .andWhere('booking.status = :status', { status: 'BOOKED' })
      .andWhere('slot.startsAt > now()')
      .getCount();

    if (upcoming > 0) {
      throw new ConflictException(
        `That architect has ${upcoming} upcoming session(s). Reschedule or cancel them first.`,
      );
    }

    await this.architectRepo.update({ id }, { isActive: false });
    // Free future slots so they stop appearing in availability.
    await this.slotRepo
      .createQueryBuilder()
      .update(SessionSlot)
      .set({ status: 'BLOCKED', blockedReason: 'COMMITMENT' })
      .where('architect_id = :id AND status = :free AND starts_at > now()', {
        id,
        free: 'FREE',
      })
      .execute();

    return { message: 'Architect deactivated and future slots closed' };
  }

  // -----------------------------------------------------------------------
  // Availability rules
  // -----------------------------------------------------------------------

  async listRules(
    architectId: string,
    siteCode: number,
  ): Promise<ArchitectAvailabilityRule[]> {
    // Through the architect, because rules carry no brand of their own.
    await this.findById(architectId, siteCode);
    return this.ruleRepo.find({
      where: { architectId, isActive: true },
      order: { weekday: 'ASC' },
    });
  }

  /**
   * Replaces the weekly pattern wholesale.
   *
   * Future FREE slots are removed because they were produced by the old rules
   * and may no longer be valid. BOOKED and BLOCKED slots are deliberately left
   * alone — a confirmed session must not vanish because the pattern changed.
   * Call slot generation afterwards to rebuild from the new rules.
   */
  async replaceAvailability(
    architectId: string,
    dto: ReplaceAvailabilityDto,
    siteCode: number,
  ): Promise<{
    rules: ArchitectAvailabilityRule[];
    removedFreeSlots: number;
    retainedBookedSlots: number;
  }> {
    await this.findById(architectId, siteCode);

    for (const rule of dto.rules) {
      if (rule.endHour <= rule.startHour) {
        throw new BadRequestException(
          `Rule for weekday ${rule.weekday}: endHour must be after startHour`,
        );
      }
      this.assertTimezone(rule.timezone);
    }

    const duplicates = dto.rules
      .map((r) => r.weekday)
      .filter((w, i, all) => all.indexOf(w) !== i);
    if (duplicates.length) {
      throw new BadRequestException(
        `Duplicate weekday(s) in rules: ${[...new Set(duplicates)].join(', ')}`,
      );
    }

    const now = new Date();
    const retainedBookedSlots = await this.slotRepo.count({
      where: {
        architectId,
        startsAt: MoreThan(now),
        status: In(['BOOKED', 'BLOCKED']),
      },
    });

    const removal = await this.slotRepo
      .createQueryBuilder()
      .delete()
      .from(SessionSlot)
      .where('architect_id = :architectId', { architectId })
      .andWhere('status = :free', { free: 'FREE' })
      .andWhere('starts_at > now()')
      .execute();

    await this.ruleRepo.delete({ architectId });
    await this.ruleRepo.save(
      dto.rules.map((r) =>
        this.ruleRepo.create({
          architectId,
          weekday: r.weekday,
          startHour: r.startHour,
          endHour: r.endHour,
          timezone: r.timezone,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo ?? null,
          isActive: true,
        }),
      ),
    );

    return {
      rules: await this.listRules(architectId, siteCode),
      removedFreeSlots: removal.affected ?? 0,
      retainedBookedSlots,
    };
  }

  // -----------------------------------------------------------------------
  // Blackouts
  // -----------------------------------------------------------------------

  listBlackouts(
    siteCode: number,
    architectId?: string,
  ): Promise<ArchitectBlackout[]> {
    return this.blackoutRepo.find({
      where: architectId ? { architectId, siteCode } : { siteCode },
      order: { startsAt: 'ASC' },
    });
  }

  /**
   * Records leave, a holiday or a commitment, and closes the slots it covers.
   *
   * Refuses rather than silently cancelling if the period already contains a
   * confirmed session. A booking system that quietly drops meetings someone has
   * put in their diary is worse than one that makes you deal with it.
   */
  async createBlackout(
    dto: CreateBlackoutDto,
    siteCode: number,
  ): Promise<{ blackout: ArchitectBlackout; blockedSlots: number }> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    if (dto.architectId) await this.findById(dto.architectId, siteCode);

    const conflicts = await this.findBookingConflicts(
      startsAt,
      endsAt,
      dto.architectId,
    );
    if (conflicts.length > 0) {
      throw new ConflictException({
        message: `That period contains ${conflicts.length} confirmed session(s). Reschedule or cancel them before adding the blackout.`,
        conflicts,
      });
    }

    const blackout = await this.blackoutRepo.save(
      this.blackoutRepo.create({
        siteCode,
        architectId: dto.architectId ?? null,
        startsAt,
        endsAt,
        reason: dto.reason,
        note: dto.note ?? null,
      }),
    );

    const qb = this.slotRepo
      .createQueryBuilder()
      .update(SessionSlot)
      .set({ status: 'BLOCKED', blockedReason: dto.reason })
      .where('status = :free', { free: 'FREE' })
      .andWhere('starts_at < :endsAt AND ends_at > :startsAt', {
        startsAt,
        endsAt,
      });

    if (dto.architectId) {
      qb.andWhere('architect_id = :architectId', {
        architectId: dto.architectId,
      });
    }

    const blocked = await qb.execute();
    return { blackout, blockedSlots: blocked.affected ?? 0 };
  }

  /** Removing a blackout reopens the slots it closed. */
  async removeBlackout(
    id: string,
    siteCode: number,
  ): Promise<{ message: string; freedSlots: number }> {
    const blackout = await this.blackoutRepo.findOne({
      where: { id, siteCode },
    });
    if (!blackout) throw new NotFoundException(`Blackout ${id} not found`);

    await this.blackoutRepo.delete({ id });

    const qb = this.slotRepo
      .createQueryBuilder()
      .update(SessionSlot)
      .set({ status: 'FREE', blockedReason: null })
      .where('status = :blocked', { blocked: 'BLOCKED' })
      .andWhere('starts_at < :endsAt AND ends_at > :startsAt', {
        startsAt: blackout.startsAt,
        endsAt: blackout.endsAt,
      });

    if (blackout.architectId) {
      qb.andWhere('architect_id = :architectId', {
        architectId: blackout.architectId,
      });
    }

    const freed = await qb.execute();
    return {
      message: 'Blackout removed and slots reopened',
      freedSlots: freed.affected ?? 0,
    };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async findBookingConflicts(
    startsAt: Date,
    endsAt: Date,
    architectId?: string,
  ): Promise<BlackoutConflict[]> {
    const qb = this.bookingRepo
      .createQueryBuilder('booking')
      .innerJoin('booking.slot', 'slot')
      .select([
        'booking.id AS "bookingId"',
        'booking.reference_no AS "referenceNo"',
        'booking.company AS company',
        'slot.starts_at AS "startsAt"',
      ])
      .where('booking.status = :status', { status: 'BOOKED' })
      .andWhere('slot.starts_at < :endsAt AND slot.ends_at > :startsAt', {
        startsAt,
        endsAt,
      });

    if (architectId) {
      qb.andWhere('booking.architect_id = :architectId', { architectId });
    }

    return qb.getRawMany<BlackoutConflict>();
  }

  /** Resolves codes to rows, rejecting the whole set if any is unknown. */
  private async resolvePractices(
    codes: number[],
  ): Promise<DiscoveryPracticeMaster[]> {
    const unique = [...new Set(codes)];
    const practices = await this.practiceRepo.find({
      where: { practiceCode: In(unique), isActive: true, isDeleted: false },
    });

    if (practices.length !== unique.length) {
      const found = practices.map((p) => p.practiceCode);
      const missing = unique.filter((c) => !found.includes(c));
      throw new BadRequestException(
        `Unknown practice code(s): ${missing.join(', ')}`,
      );
    }
    return practices;
  }

  private async assertOfficeExists(officeCode: number): Promise<void> {
    const office = await this.officeRepo.findOne({
      where: { officeCode, isActive: true, isDeleted: false },
    });
    if (!office) {
      throw new BadRequestException(`Unknown office code: ${officeCode}`);
    }
  }

  private assertTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException(`Unknown timezone: ${timezone}`);
    }
  }
}
