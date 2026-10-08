import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CraneServiceLineMaster } from '../masters/entities/crane-service-line-master.entity';
import {
  AssignServiceLinesDto,
  CreateCraneEngineerDto,
  UpdateCraneEngineerDto,
} from './dto/upsert-crane-engineer.dto';
import { CraneEngineer } from './entities/crane-engineer.entity';
import { CraneSiteVisit } from './entities/crane-site-visit.entity';

/** One line in the assign dropdown — see `assignmentOptions`. */
export interface EngineerOption {
  /** Unique per line, which `engineerId` is not. */
  optionId: string;
  engineerId: string;
  name: string;
  /** "Statutory Inspections & Load Testing Engineer - Rehan Afzal". */
  label: string;
  designation: string;
  /** The service line this line is filed under; null for anybody with none. */
  serviceLineCode: number | null;
  /** What gets written to the visit's text column, for continuity. */
  email: string;
}

@Injectable()
export class CraneEngineerService {
  constructor(
    @InjectRepository(CraneEngineer)
    private readonly engineerRepo: Repository<CraneEngineer>,
    @InjectRepository(CraneServiceLineMaster)
    private readonly serviceLineRepo: Repository<CraneServiceLineMaster>,
    @InjectRepository(CraneSiteVisit)
    private readonly visitRepo: Repository<CraneSiteVisit>,
  ) {}

  list(includeInactive = false, siteCode: number): Promise<CraneEngineer[]> {
    return this.engineerRepo.find({
      where: includeInactive
        ? { isDeleted: false, siteCode }
        : { isDeleted: false, isActive: true, siteCode },
      relations: { serviceLines: true },
      order: { fullName: 'ASC' },
    });
  }

  /** The choke point — everything else reads through here, so the brand is
      bound once rather than in each method. */
  async findById(id: string, siteCode: number): Promise<CraneEngineer> {
    const engineer = await this.engineerRepo.findOne({
      where: { id, isDeleted: false, siteCode },
      relations: { serviceLines: true },
    });
    if (!engineer) throw new NotFoundException(`Engineer ${id} not found`);
    return engineer;
  }

  /** The service-line dropdown, in display order. */
  listServiceLines(): Promise<CraneServiceLineMaster[]> {
    return this.serviceLineRepo.find({
      where: { isActive: true, isDeleted: false },
      order: { displayOrder: 'ASC' },
    });
  }

  async create(
    dto: CreateCraneEngineerDto,
    siteCode: number,
  ): Promise<CraneEngineer> {
    const serviceLines = await this.resolveServiceLines(dto.serviceLineCodes);
    await this.assertEmailIsFree(dto.email, siteCode);

    const saved = await this.engineerRepo.save(
      this.engineerRepo.create({
        siteCode,
        fullName: dto.fullName.trim(),
        designation: dto.designation.trim(),
        email: dto.email.trim(),
        phone: dto.phone.trim(),
        experienceYears: dto.experienceYears,
        serviceLines,
        isActive: dto.isActive ?? true,
      }),
    );
    return this.findById(saved.id, siteCode);
  }

  async update(
    id: string,
    dto: UpdateCraneEngineerDto,
    siteCode: number,
  ): Promise<CraneEngineer> {
    const engineer = await this.findById(id, siteCode);

    if (dto.email !== undefined && dto.email.trim() !== engineer.email) {
      await this.assertEmailIsFree(dto.email, siteCode, id);
    }

    await this.engineerRepo.update(
      { id },
      {
        ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
        ...(dto.designation !== undefined && {
          designation: dto.designation.trim(),
        }),
        ...(dto.email !== undefined && { email: dto.email.trim() }),
        ...(dto.phone !== undefined && { phone: dto.phone.trim() }),
        ...(dto.experienceYears !== undefined && {
          experienceYears: dto.experienceYears,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    );

    // A join table is a relation, so it is written separately from the columns.
    if (dto.serviceLineCodes) {
      const lines = await this.resolveServiceLines(dto.serviceLineCodes);
      await this.setServiceLineRows(
        id,
        lines.map((l) => l.serviceLineCode),
      );
    }

    return this.findById(id, siteCode);
  }

  /**
   * Replace the set of services an engineer covers.
   *
   * Nothing else moves. Service lines describe what somebody can do, not what
   * they are booked for — visits already assigned stay with them whatever the
   * list says afterwards.
   */
  async assignServiceLines(
    id: string,
    dto: AssignServiceLinesDto,
    siteCode: number,
  ): Promise<{ engineer: CraneEngineer; added: number[]; removed: number[] }> {
    const engineer = await this.findById(id, siteCode);
    const lines = await this.resolveServiceLines(dto.serviceLineCodes);

    const before = (engineer.serviceLines ?? []).map((l) => l.serviceLineCode);
    const after = lines.map((l) => l.serviceLineCode);
    const added = after.filter((c) => !before.includes(c));
    const removed = before.filter((c) => !after.includes(c));

    if (added.length === 0 && removed.length === 0) {
      throw new BadRequestException(
        'That engineer already covers exactly these service lines',
      );
    }

    await this.setServiceLineRows(id, after);
    return { engineer: await this.findById(id, siteCode), added, removed };
  }

  /**
   * Take an engineer off the roster.
   *
   * Refused while visits are still ahead of them, which is the whole point of
   * the check: the customer has been told who is attending, and a roster that
   * lets somebody vanish from a confirmed visit is worse than no roster.
   * Counted on the visit's own scheduled date — there is no second table to
   * join through, which is how the architect version of this quietly broke.
   */
  async deactivate(id: string, siteCode: number): Promise<{ message: string }> {
    const engineer = await this.findById(id, siteCode);

    const upcoming = await this.visitRepo
      .createQueryBuilder('visit')
      .where('visit.assignedEngineerId = :id', { id })
      .andWhere('visit.status NOT IN (:...done)', {
        done: ['CANCELLED', 'COMPLETED'],
      })
      .andWhere('visit.scheduledAt > now()')
      .getCount();

    if (upcoming > 0) {
      throw new ConflictException(
        `${engineer.fullName} has ${upcoming} upcoming visit(s). Reassign or cancel them first.`,
      );
    }

    await this.engineerRepo.update({ id }, { isActive: false });
    return { message: `${engineer.fullName} is no longer on the roster` };
  }

  /**
   * Who a visit can be given to.
   *
   * A LINE PER SERVICE LINE, not per engineer. Somebody who covers both
   * commissioning and load testing appears under each, because the coordinator
   * arrives knowing the work the visit needs rather than the person — and a
   * single line naming only their first service hides them from the search
   * everybody is actually doing.
   *
   * Every active engineer is offered, with no filtering against what the
   * customer requested. The desk may know the request was misfiled, and an
   * engineer hidden by a guess looks like one who does not exist.
   */
  async assignmentOptions(siteCode: number): Promise<EngineerOption[]> {
    const engineers = await this.list(false, siteCode);

    const lines: EngineerOption[] = [];
    for (const e of engineers) {
      const base = {
        engineerId: e.id,
        name: e.fullName,
        designation: e.designation,
        email: e.email,
      };

      if ((e.serviceLines ?? []).length === 0) {
        /* Their bare name. "Engineer - Rehan Afzal" with nothing in front
           would invent a speciality, and the gap is what should prompt
           somebody to go and record one. */
        lines.push({
          ...base,
          optionId: `${e.id}:none`,
          label: e.fullName,
          serviceLineCode: null,
        });
        continue;
      }

      for (const l of e.serviceLines) {
        lines.push({
          ...base,
          optionId: `${e.id}:${l.serviceLineCode}`,
          label: `${l.serviceLineName} Engineer - ${e.fullName}`,
          serviceLineCode: l.serviceLineCode,
        });
      }
    }

    /* Service line first, then name, in the master's own display order rather
       than whatever order the join returned — a list that reshuffles between
       page loads looks like the data changed. Engineers with no service line
       sort last: those are the records somebody still has to finish. */
    const order = new Map<number, number>();
    for (const e of engineers) {
      for (const l of e.serviceLines ?? []) {
        order.set(l.serviceLineCode, l.displayOrder);
      }
    }
    const rank = (c: number | null) =>
      c === null
        ? Number.MAX_SAFE_INTEGER
        : (order.get(c) ?? Number.MAX_SAFE_INTEGER);

    return lines.sort(
      (x, y) =>
        rank(x.serviceLineCode) - rank(y.serviceLineCode) ||
        x.name.localeCompare(y.name),
    );
  }

  /** Resolves codes to rows, rejecting the whole set if any is unknown. */
  private async resolveServiceLines(
    codes: number[],
  ): Promise<CraneServiceLineMaster[]> {
    const unique = [...new Set(codes)];
    const lines = await this.serviceLineRepo.find({
      where: { serviceLineCode: In(unique), isActive: true, isDeleted: false },
    });

    if (lines.length !== unique.length) {
      const found = lines.map((l) => l.serviceLineCode);
      const missing = unique.filter((c) => !found.includes(c));
      throw new BadRequestException(
        `Unknown service line code(s): ${missing.join(', ')}`,
      );
    }
    return lines;
  }

  /**
   * One engineer per email address, per unit.
   *
   * Case- and space-insensitive: "R.Afzal@veltrixair.com " and
   * "r.afzal@veltrixair.com" are one colleague, and a check that misses that
   * is one that lets the duplicate through on the second attempt. The database
   * enforces it too; this exists to say whose record it clashed with.
   */
  private async assertEmailIsFree(
    email: string,
    siteCode: number,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.engineerRepo
      .createQueryBuilder('engineer')
      .where('lower(engineer.email) = lower(:email)', { email: email.trim() })
      .andWhere('engineer.siteCode = :siteCode', { siteCode })
      .andWhere('engineer.isDeleted = false')
      .getOne();

    if (clash && clash.id !== exceptId) {
      throw new BadRequestException(
        `${clash.fullName} is already on the roster with that email address.`,
      );
    }
  }

  /**
   * Replaces the join rows for an engineer.
   *
   * Written directly rather than through `save()` on the relation: TypeORM
   * re-inserts the whole set instead of diffing it, which collides with the
   * composite primary key on rows that already exist.
   */
  private async setServiceLineRows(
    engineerId: string,
    codes: number[],
  ): Promise<void> {
    await this.engineerRepo.manager.transaction(async (manager) => {
      await manager.query(
        'DELETE FROM crane_engineer_service_lines WHERE engineer_id = $1',
        [engineerId],
      );
      if (codes.length > 0) {
        await manager.query(
          `INSERT INTO crane_engineer_service_lines (engineer_id, service_line_code)
           SELECT $1, unnest($2::int[])`,
          [engineerId, codes],
        );
      }
    });
  }
}
