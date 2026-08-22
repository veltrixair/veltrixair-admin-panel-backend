import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/pagination-query.dto';
import { SITE_CODE } from '../applications/crane-application.constants';
import { CraneAvailabilityMaster } from '../masters/entities/crane-availability-master.entity';
import { CraneCareerQualificationMaster } from '../masters/entities/crane-career-qualification-master.entity';
import { CraneCareerTrackMaster } from '../masters/entities/crane-career-track-master.entity';
import { CraneEmploymentTypeMaster } from '../masters/entities/crane-employment-type-master.entity';
import { CraneExperienceBandMaster } from '../masters/entities/crane-experience-band-master.entity';
import { CraneJobLocationMaster } from '../masters/entities/crane-job-location-master.entity';
import { CraneResidencyStatusMaster } from '../masters/entities/crane-residency-status-master.entity';
import {
  ListCraneJobsDto,
  UpsertCraneJobDto,
} from './dto/upsert-crane-job.dto';
import { CraneApplication } from '../applications/entities/crane-application.entity';
import { CraneJobPosting } from './entities/crane-job-posting.entity';
import type { CraneJobStatus } from './entities/crane-job-posting.entity';

export interface CraneCareerOptions {
  tracks: { code: number; label: string }[];
  experienceBands: { code: number; label: string }[];
  availability: { code: number; label: string }[];
  residencyStatuses: { code: number; label: string }[];
  qualifications: { code: number; label: string }[];
  locations: { code: number; label: string }[];
  employmentTypes: { code: number; label: string }[];
}

/** A crane advert on the admin board, carrying how many people applied. */
export interface CraneJobPostingWithApplicants extends CraneJobPosting {
  applicantCount: number;
  /** Still sitting at SUBMITTED — nobody has screened them yet. */
  newApplicantCount: number;
}

@Injectable()
export class CraneCareerService {
  constructor(
    @InjectRepository(CraneJobPosting)
    private readonly jobRepo: Repository<CraneJobPosting>,
    @InjectRepository(CraneCareerTrackMaster)
    private readonly trackRepo: Repository<CraneCareerTrackMaster>,
    @InjectRepository(CraneExperienceBandMaster)
    private readonly bandRepo: Repository<CraneExperienceBandMaster>,
    @InjectRepository(CraneAvailabilityMaster)
    private readonly availabilityRepo: Repository<CraneAvailabilityMaster>,
    @InjectRepository(CraneResidencyStatusMaster)
    private readonly residencyRepo: Repository<CraneResidencyStatusMaster>,
    @InjectRepository(CraneCareerQualificationMaster)
    private readonly qualificationRepo: Repository<CraneCareerQualificationMaster>,
    @InjectRepository(CraneJobLocationMaster)
    private readonly locationRepo: Repository<CraneJobLocationMaster>,
    @InjectRepository(CraneEmploymentTypeMaster)
    private readonly employmentRepo: Repository<CraneEmploymentTypeMaster>,
    @InjectRepository(CraneApplication)
    private readonly applicationRepo: Repository<CraneApplication>,
  ) {}

  // =======================================================================
  // Public
  // =======================================================================

  /**
   * Every dropdown on the careers page and its application form.
   *
   * Served from one endpoint so the form never hard-codes a code — the same
   * rule the quote and site-visit forms already follow.
   */
  async options(): Promise<CraneCareerOptions> {
    const live = {
      where: { isActive: true, isDeleted: false },
      order: { displayOrder: 'ASC' as const },
    };

    const [
      tracks,
      bands,
      availability,
      residency,
      qualifications,
      locations,
      employmentTypes,
    ] = await Promise.all([
      this.trackRepo.find(live),
      this.bandRepo.find(live),
      this.availabilityRepo.find(live),
      this.residencyRepo.find(live),
      this.qualificationRepo.find(live),
      this.locationRepo.find(live),
      this.employmentRepo.find(live),
    ]);

    return {
      tracks: tracks.map((t) => ({ code: t.trackCode, label: t.trackName })),
      experienceBands: bands.map((b) => ({
        code: b.bandCode,
        label: b.bandName,
      })),
      availability: availability.map((a) => ({
        code: a.availabilityCode,
        label: a.availabilityName,
      })),
      residencyStatuses: residency.map((r) => ({
        code: r.residencyCode,
        label: r.residencyName,
      })),
      qualifications: qualifications.map((q) => ({
        code: q.qualificationCode,
        label: q.qualificationName,
      })),
      locations: locations.map((l) => ({
        code: l.locationCode,
        label: l.locationName,
      })),
      employmentTypes: employmentTypes.map((e) => ({
        code: e.employmentTypeCode,
        label: e.employmentTypeName,
      })),
    };
  }

  /** Open roles only, closing date respected. */
  async listPublic(
    query: ListCraneJobsDto,
  ): Promise<PaginatedResult<CraneJobPosting>> {
    const qb = this.baseQuery(query)
      .andWhere('job.status = :status', { status: 'OPEN' })
      .andWhere('(job.closesAt IS NULL OR job.closesAt > now())');

    return this.paginate(qb, query);
  }

  async findBySlug(slug: string): Promise<CraneJobPosting> {
    const job = await this.relations()
      .where('job.slug = :slug', { slug })
      .andWhere('job.isDeleted = false')
      .andWhere('job.siteCode = :siteCode', { siteCode: SITE_CODE })
      .andWhere('job.status = :status', { status: 'OPEN' })
      .getOne();

    if (!job) throw new NotFoundException(`No open role found for "${slug}"`);
    return job;
  }

  // =======================================================================
  // Admin
  // =======================================================================

  /** Includes drafts and closed roles, and how many people applied to each. */
  async listForAdmin(
    query: ListCraneJobsDto,
  ): Promise<PaginatedResult<CraneJobPostingWithApplicants>> {
    const qb = this.baseQuery(query);
    if (query.status) {
      qb.andWhere('job.status = :status', { status: query.status });
    }

    const page = await this.paginate(qb, query);
    return { ...page, items: await this.withApplicantCounts(page.items) };
  }

  /**
   * Attaches applicant counts to a page of adverts.
   *
   * Mirrors the IT board deliberately, so the two careers screens can share a
   * column. What differs is only the name of the untouched state — a crane
   * application arrives as SUBMITTED, an IT one as NEW.
   *
   * Counts only applications tied to a posting. Six crane tracks include a
   * general "keep on file" application with a null `job_id`, and those belong
   * to nobody's advert; adding them to every row would be an invented number.
   */
  private async withApplicantCounts(
    jobs: CraneJobPosting[],
  ): Promise<CraneJobPostingWithApplicants[]> {
    if (!jobs.length) return [];

    const rows = await this.applicationRepo
      .createQueryBuilder('application')
      .select('application.job_id', 'jobId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        "COUNT(*) FILTER (WHERE application.status = 'SUBMITTED')",
        'unreviewed',
      )
      .where('application.job_id IN (:...ids)', { ids: jobs.map((j) => j.id) })
      .andWhere('application.is_deleted = false')
      .groupBy('application.job_id')
      .getRawMany<{ jobId: string; total: string; unreviewed: string }>();

    const byJob = new Map(rows.map((r) => [r.jobId, r]));

    return jobs.map((job) => ({
      ...job,
      applicantCount: Number(byJob.get(job.id)?.total ?? 0),
      newApplicantCount: Number(byJob.get(job.id)?.unreviewed ?? 0),
    }));
  }

  async findById(id: string): Promise<CraneJobPosting> {
    const job = await this.relations()
      .where('job.id = :id', { id })
      .andWhere('job.isDeleted = false')
      .andWhere('job.siteCode = :siteCode', { siteCode: SITE_CODE })
      .getOne();

    if (!job) throw new NotFoundException(`Crane role ${id} not found`);
    return job;
  }

  async create(dto: UpsertCraneJobDto): Promise<CraneJobPosting> {
    await this.assertRefAndSlugFree(dto.refCode, dto.slug);
    await this.assertCodesExist(dto);

    const saved = await this.jobRepo.save(
      this.jobRepo.create({ ...this.mapScalars(dto), siteCode: SITE_CODE }),
    );
    return this.findById(saved.id);
  }

  async update(id: string, dto: UpsertCraneJobDto): Promise<CraneJobPosting> {
    const job = await this.findById(id);
    await this.assertRefAndSlugFree(dto.refCode, dto.slug, id);
    await this.assertCodesExist(dto);

    // update() rather than save(): nothing here owns a relation table, but
    // keeping the two symmetrical with the IT module avoids the trap that one
    // fell into, where save() on a loaded relation re-inserted its join rows.
    await this.jobRepo.update({ id }, this.mapScalars(dto, job));
    return this.findById(id);
  }

  async setStatus(id: string, status: CraneJobStatus) {
    const job = await this.findById(id);

    const patch: Partial<CraneJobPosting> = { status };
    if (status === 'OPEN' && !job.postedAt) patch.postedAt = new Date();

    await this.jobRepo.update({ id }, patch);
    return this.findById(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findById(id);
    await this.jobRepo.update({ id }, { isDeleted: true, status: 'CLOSED' });
    return { message: 'Crane role removed' };
  }

  // =======================================================================
  // Internals
  // =======================================================================

  private relations() {
    return this.jobRepo
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.track', 'track')
      .leftJoinAndSelect('job.serviceLine', 'serviceLine')
      .leftJoinAndSelect('job.location', 'location')
      .leftJoinAndSelect('job.employmentType', 'employmentType')
      .leftJoinAndSelect('job.experienceBand', 'experienceBand');
  }

  /** The one place a listing is bound to the brand and to undeleted rows. */
  private baseQuery(query: ListCraneJobsDto) {
    const qb = this.relations()
      .where('job.isDeleted = false')
      .andWhere('job.siteCode = :siteCode', { siteCode: SITE_CODE });

    if (query.trackCode !== undefined) {
      qb.andWhere('job.trackCode = :trackCode', { trackCode: query.trackCode });
    }
    if (query.locationCode !== undefined) {
      qb.andWhere('job.locationCode = :locationCode', {
        locationCode: query.locationCode,
      });
    }
    if (query.search) {
      qb.andWhere('(job.title ILIKE :q OR job.refCode ILIKE :q)', {
        q: `%${query.search}%`,
      });
    }
    return qb;
  }

  private async paginate(
    qb: ReturnType<CraneCareerService['baseQuery']>,
    query: ListCraneJobsDto,
  ): Promise<PaginatedResult<CraneJobPosting>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await qb
      .orderBy('job.displayOrder', 'ASC')
      .addOrderBy('job.createdDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  private async assertRefAndSlugFree(
    refCode?: string,
    slug?: string,
    exceptId?: string,
  ): Promise<void> {
    for (const [field, value] of [
      ['refCode', refCode],
      ['slug', slug],
    ] as const) {
      if (!value) continue;
      const clash = await this.jobRepo.findOne({
        where: {
          [field]: value,
          ...(exceptId ? { id: Not(exceptId) } : {}),
        },
        select: ['id'],
      });
      if (clash) {
        throw new ConflictException(
          `Another role already uses ${field} "${value}"`,
        );
      }
    }
  }

  /** Every coded field checked in one pass, so a bad form reports all of it. */
  private async assertCodesExist(dto: UpsertCraneJobDto): Promise<void> {
    const live = { isActive: true, isDeleted: false };
    const checks: [string, Promise<unknown>][] = [];

    if (dto.trackCode !== undefined) {
      checks.push([
        `trackCode ${dto.trackCode}`,
        this.trackRepo.findOne({
          where: { trackCode: dto.trackCode, ...live },
        }),
      ]);
    }
    if (dto.locationCode !== undefined) {
      checks.push([
        `locationCode ${dto.locationCode}`,
        this.locationRepo.findOne({
          where: { locationCode: dto.locationCode, ...live },
        }),
      ]);
    }
    if (dto.employmentTypeCode !== undefined) {
      checks.push([
        `employmentTypeCode ${dto.employmentTypeCode}`,
        this.employmentRepo.findOne({
          where: { employmentTypeCode: dto.employmentTypeCode, ...live },
        }),
      ]);
    }
    if (dto.experienceBandCode != null) {
      checks.push([
        `experienceBandCode ${dto.experienceBandCode}`,
        this.bandRepo.findOne({
          where: { bandCode: dto.experienceBandCode, ...live },
        }),
      ]);
    }

    const results = await Promise.all(checks.map(([, promise]) => promise));
    const unknown = checks
      .filter((_, index) => !results[index])
      .map(([label]) => label);

    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown or inactive: ${unknown.join(', ')}`,
      );
    }
  }

  private mapScalars(
    dto: UpsertCraneJobDto,
    current?: CraneJobPosting,
  ): Partial<CraneJobPosting> {
    return {
      refCode: dto.refCode ?? current?.refCode,
      slug: dto.slug ?? current?.slug,
      title: dto.title ?? current?.title,
      trackCode: dto.trackCode ?? current?.trackCode,
      // `undefined` keeps what is there, `null` clears it — the distinction the
      // IT module's `??` chain cannot express.
      serviceLineCode:
        dto.serviceLineCode === undefined
          ? (current?.serviceLineCode ?? null)
          : (dto.serviceLineCode ?? null),
      locationCode: dto.locationCode ?? current?.locationCode,
      employmentTypeCode: dto.employmentTypeCode ?? current?.employmentTypeCode,
      experienceBandCode:
        dto.experienceBandCode === undefined
          ? (current?.experienceBandCode ?? null)
          : (dto.experienceBandCode ?? null),
      summary: dto.summary ?? current?.summary ?? null,
      descriptionMdx: dto.descriptionMdx ?? current?.descriptionMdx ?? null,
      responsibilities: dto.responsibilities ?? current?.responsibilities ?? [],
      requirements: dto.requirements ?? current?.requirements ?? [],
      certifications: dto.certifications ?? current?.certifications ?? [],
      saudiNationalsOnly:
        dto.saudiNationalsOnly ?? current?.saudiNationalsOnly ?? false,
      openings: dto.openings ?? current?.openings ?? 1,
      status: dto.status ?? current?.status ?? 'DRAFT',
      displayOrder: dto.displayOrder ?? current?.displayOrder ?? 0,
      seoTitle: dto.seoTitle ?? current?.seoTitle ?? null,
      seoDescription: dto.seoDescription ?? current?.seoDescription ?? null,
      closesAt: dto.closesAt
        ? new Date(dto.closesAt)
        : (current?.closesAt ?? null),
    };
  }
}
