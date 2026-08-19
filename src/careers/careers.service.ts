import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { JobLocationMaster } from '../master-data/entities/job-location-master.entity';
import { ListJobsAdminDto, ListJobsDto } from './dto/list-jobs.dto';
import { CreateJobDto, UpdateJobDto } from './dto/upsert-job.dto';
import { toJobDetail, toJobListItem } from './dto/job-response.dto';
import type { JobDetail, JobListItem } from './dto/job-response.dto';
import { JobPosting } from './entities/job-posting.entity';
import type { JobStatus } from './entities/job-posting.entity';

@Injectable()
export class CareersService {
  constructor(
    @InjectRepository(JobPosting)
    private readonly jobRepo: Repository<JobPosting>,
    @InjectRepository(JobLocationMaster)
    private readonly locationRepo: Repository<JobLocationMaster>,
  ) {}

  // -----------------------------------------------------------------------
  // Public listings
  // -----------------------------------------------------------------------

  /** Only OPEN roles, and only those whose closing date has not passed. */
  async listPublic(
    query: ListJobsDto,
    siteCode: number,
  ): Promise<PaginatedResult<JobListItem>> {
    const qb = this.baseQuery(query, siteCode)
      .andWhere('job.status = :status', { status: 'OPEN' })
      .andWhere('(job.closesAt IS NULL OR job.closesAt > now())');

    const page = await this.paginate(qb, query);
    return { ...page, items: page.items.map(toJobListItem) };
  }

  /**
   * Detail view behind the "View" action on a role card.
   *
   * Joins the office as well as practice and locations — the page shows where
   * the role sits, and the office carries the address and working hours.
   */
  async findBySlug(slug: string, siteCode: number): Promise<JobDetail> {
    const job = await this.jobRepo
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.practice', 'practice')
      .leftJoinAndSelect('job.locations', 'location')
      .leftJoinAndSelect('job.office', 'office')
      .where('job.slug = :slug', { slug })
      .andWhere('job.isDeleted = false')
      .andWhere('job.siteCode = :siteCode', { siteCode })
      .andWhere('job.status = :status', { status: 'OPEN' })
      .getOne();

    if (!job) {
      throw new NotFoundException(`No open role found for "${slug}"`);
    }
    return toJobDetail(job);
  }

  // -----------------------------------------------------------------------
  // Admin
  // -----------------------------------------------------------------------

  /** Includes drafts and closed roles. */
  listForAdmin(
    query: ListJobsAdminDto,
    siteCode: number,
  ): Promise<PaginatedResult<JobPosting>> {
    const qb = this.baseQuery(query, siteCode);

    if (query.status) {
      qb.andWhere('job.status = :status', { status: query.status });
    }
    if (query.practiceCode !== undefined) {
      qb.andWhere('job.practiceCode = :practiceCode', {
        practiceCode: query.practiceCode,
      });
    }

    return this.paginate(qb, query);
  }

  /**
   * The other choke point: create, update, setStatus and remove all read
   * through this, so a wrong-brand id is a 404 for all of them.
   */
  async findById(id: string, siteCode: number): Promise<JobPosting> {
    const job = await this.jobRepo.findOne({
      where: { id, isDeleted: false, siteCode },
      relations: { practice: true, locations: true, office: true },
    });
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    return job;
  }

  async create(dto: CreateJobDto, siteCode: number): Promise<JobPosting> {
    await this.assertRefCodeAndSlugFree(siteCode, dto.refCode, dto.slug);

    const job = this.jobRepo.create({
      ...this.mapScalars(dto),
      siteCode,
      refCode: dto.refCode,
      slug: dto.slug,
      title: dto.title,
      locations: await this.resolveLocations(dto.locationCodes),
    });

    const saved = await this.jobRepo.save(job);
    return this.findById(saved.id, siteCode);
  }

  async update(
    id: string,
    dto: UpdateJobDto,
    siteCode: number,
  ): Promise<JobPosting> {
    const job = await this.findById(id, siteCode);

    if (dto.refCode && dto.refCode !== job.refCode) {
      await this.assertRefCodeAndSlugFree(siteCode, dto.refCode, undefined, id);
      job.refCode = dto.refCode;
    }
    if (dto.slug && dto.slug !== job.slug) {
      await this.assertRefCodeAndSlugFree(siteCode, undefined, dto.slug, id);
      job.slug = dto.slug;
    }
    if (dto.title !== undefined) job.title = dto.title;

    /*
     * Scalars go through update(), not save().
     *
     * `findById` loads the locations relation, and save() on an entity whose
     * many-to-many was loaded re-inserts the join rows — so every PATCH, even
     * one touching only the title, died on the join table's primary key. This
     * was failing for every update before the field config existed; the config
     * only made it visible because nothing else PATCHes a job in the tests.
     *
     * update() writes columns and nothing else, so the join table is untouched
     * unless the caller actually asked for different locations.
     */
    await this.jobRepo.update(
      { id },
      {
        ...this.mapScalars(dto, job),
        refCode: job.refCode,
        slug: job.slug,
        title: job.title,
      },
    );

    if (dto.locationCodes) {
      const wanted = await this.resolveLocations(dto.locationCodes);
      await this.jobRepo
        .createQueryBuilder()
        .relation(JobPosting, 'locations')
        .of(id)
        .addAndRemove(
          wanted.map((l) => l.locationCode),
          (job.locations ?? []).map((l) => l.locationCode),
        );
    }

    return this.findById(id, siteCode);
  }

  async setStatus(
    id: string,
    status: JobStatus,
    siteCode: number,
  ): Promise<JobPosting> {
    const job = await this.findById(id, siteCode);

    // Publishing for the first time stamps postedAt.
    const patch: Partial<JobPosting> = { status };
    if (status === 'OPEN' && !job.postedAt) {
      patch.postedAt = new Date();
    }

    await this.jobRepo.update({ id }, patch);
    return this.findById(id, siteCode);
  }

  /** Soft delete — listings disappear but the record and its history remain. */
  async remove(id: string, siteCode: number): Promise<{ message: string }> {
    await this.findById(id, siteCode);
    await this.jobRepo.update({ id }, { isDeleted: true, status: 'CLOSED' });
    return { message: 'Job posting removed' };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Every list goes through here, so binding the brand once binds them all.
   */
  private baseQuery(
    query: ListJobsDto,
    siteCode: number,
  ): SelectQueryBuilder<JobPosting> {
    const qb = this.jobRepo
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.practice', 'practice')
      .leftJoinAndSelect('job.locations', 'location')
      .where('job.isDeleted = false')
      .andWhere('job.siteCode = :siteCode', { siteCode });

    if (query.practice) {
      qb.andWhere('practice.slug = :practiceSlug', {
        practiceSlug: query.practice,
      });
    }

    if (query.location) {
      // A second join so filtering by one location does not truncate the
      // location list returned for each row.
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM job_posting_locations jpl
           INNER JOIN job_location_masters jlm ON jlm.location_code = jpl.location_code
           WHERE jpl.job_posting_id = job.id AND jlm.slug = :locationSlug
         )`,
        { locationSlug: query.location },
      );
    }

    if (query.workMode) {
      qb.andWhere('job.workMode = :workMode', { workMode: query.workMode });
    }

    if (query.search) {
      qb.andWhere(
        '(job.title ILIKE :search OR job.summary ILIKE :search OR job.refCode ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.hotOnly === 'true') {
      qb.andWhere('job.hotRole = true');
    }

    switch (query.sort) {
      case 'oldest':
        qb.orderBy('job.postedAt', 'ASC');
        break;
      case 'title':
        qb.orderBy('job.title', 'ASC');
        break;
      case 'newest':
        qb.orderBy('job.postedAt', 'DESC');
        break;
      default:
        // Hot roles first, then curated order — matches how the page reads.
        qb.orderBy('job.hotRole', 'DESC').addOrderBy('job.displayOrder', 'ASC');
    }

    return qb;
  }

  private async paginate(
    qb: SelectQueryBuilder<JobPosting>,
    query: ListJobsDto,
  ): Promise<PaginatedResult<JobPosting>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private async resolveLocations(
    codes: number[],
  ): Promise<JobLocationMaster[]> {
    const locations = await this.locationRepo.find({
      where: { locationCode: In(codes), isActive: true, isDeleted: false },
    });

    if (locations.length !== codes.length) {
      const found = locations.map((l) => l.locationCode);
      const missing = codes.filter((c) => !found.includes(c));
      throw new BadRequestException(
        `Unknown location code(s): ${missing.join(', ')}`,
      );
    }
    return locations;
  }

  /**
   * Uniqueness is per brand — the migration made the slug index
   * (site_code, slug), so cranes and IT may both run a
   * "senior-project-manager" without colliding.
   */
  private async assertRefCodeAndSlugFree(
    siteCode: number,
    refCode?: string,
    slug?: string,
    excludeId?: string,
  ): Promise<void> {
    for (const [field, value] of [
      ['refCode', refCode],
      ['slug', slug],
    ] as const) {
      if (!value) continue;
      const existing = await this.jobRepo.findOne({
        where: { [field]: value, siteCode },
      });
      if (existing && existing.id !== excludeId) {
        throw new BadRequestException(
          `A job with ${field} "${value}" already exists`,
        );
      }
    }
  }

  /** Copies the plain columns a DTO may carry, leaving relations alone. */
  private mapScalars(
    dto: UpdateJobDto,
    current?: JobPosting,
  ): Partial<JobPosting> {
    return {
      descriptionMdx: dto.descriptionMdx ?? current?.descriptionMdx ?? null,
      practiceCode: dto.practiceCode ?? current?.practiceCode,
      locationLabel: dto.locationLabel ?? current?.locationLabel,
      workMode: dto.workMode ?? current?.workMode ?? 'ONSITE',
      officeCode: dto.officeCode ?? current?.officeCode,
      employmentType: dto.employmentType ?? current?.employmentType,
      experienceLabel: dto.experienceLabel ?? current?.experienceLabel,
      visaSponsorship: dto.visaSponsorship ?? current?.visaSponsorship ?? null,
      hotRole: dto.hotRole ?? current?.hotRole ?? false,
      displayOrder: dto.displayOrder ?? current?.displayOrder ?? 0,
      seoTitle: dto.seoTitle ?? current?.seoTitle ?? null,
      seoDescription: dto.seoDescription ?? current?.seoDescription ?? null,
      status: dto.status ?? current?.status ?? 'DRAFT',
      /*
       * `undefined` and `null` mean different things here, so this cannot use
       * the `??` chain the fields above use: omitting the key keeps whatever
       * the posting has, while sending null resets it to the defaults. With
       * `??` there would be no way back to the defaults once a config was set.
       *
       * The other nullable fields on this object share that limitation — you
       * cannot clear a seoTitle by sending null either. Left alone rather than
       * changed wholesale, since that is a separate decision.
       */
      applicationFields:
        dto.applicationFields === undefined
          ? (current?.applicationFields ?? null)
          : (dto.applicationFields ?? null),
      postedAt: dto.postedAt
        ? new Date(dto.postedAt)
        : (current?.postedAt ?? null),
      closesAt: dto.closesAt
        ? new Date(dto.closesAt)
        : (current?.closesAt ?? null),
    };
  }
}
