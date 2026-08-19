import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/pagination-query.dto';
import { ReferenceNumberService } from '../../common/services/reference-number.service';
import { SpamCheckService } from '../../common/services/spam-check.service';
import { addBusinessDays } from '../../common/utils/business-hours.util';
import { FilesService } from '../../files/files.service';
import type { UploadedFile } from '../../files/files.service';
import { MailService } from '../../mail/mail.service';
import { CraneJobPosting } from '../careers/entities/crane-job-posting.entity';
import { CraneAvailabilityMaster } from '../masters/entities/crane-availability-master.entity';
import { CraneCareerQualificationMaster } from '../masters/entities/crane-career-qualification-master.entity';
import { CraneCareerTrackMaster } from '../masters/entities/crane-career-track-master.entity';
import { CraneExperienceBandMaster } from '../masters/entities/crane-experience-band-master.entity';
import { CraneResidencyStatusMaster } from '../masters/entities/crane-residency-status-master.entity';
import {
  CAREERS_INBOX,
  KSA_CALENDAR,
  REFERENCE_PREFIX,
  REFERENCE_SEQUENCE,
  RETENTION_MONTHS,
  SITE_CODE,
  STAGE_SLA_WORKING_DAYS,
} from './crane-application.constants';
import { CreateCraneApplicationDto } from './dto/create-crane-application.dto';
import { ListCraneApplicationsDto } from './dto/manage-crane-application.dto';
import { CraneApplicationEvent } from './entities/crane-application-event.entity';
import {
  CRANE_CLOSED_STATUSES,
  CraneApplication,
} from './entities/crane-application.entity';
import type { CraneApplicationStatus } from './entities/crane-application.entity';

export interface SubmissionContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Columns safe to list — no nationality, mobile, certifications or background.
 *
 * Nationality and residency are the reason this table has its own feature code;
 * putting them in a list view would undo that in one line.
 */
const LIST_COLUMNS = [
  'application.id',
  'application.referenceNo',
  'application.trackCode',
  'application.jobId',
  'application.experienceBandCode',
  'application.availabilityCode',
  'application.fullName',
  'application.email',
  'application.currentLocation',
  'application.residencyCode',
  'application.qualificationCode',
  'application.cvFileId',
  'application.cvAttachedAt',
  'application.status',
  'application.acknowledgedAt',
  'application.stageDueAt',
  'application.assignedTo',
  'application.assignedAt',
  'application.spamScore',
  'application.createdDate',
];

@Injectable()
export class CraneApplicationService {
  private readonly logger = new Logger(CraneApplicationService.name);

  constructor(
    @InjectRepository(CraneApplication)
    private readonly applicationRepo: Repository<CraneApplication>,
    @InjectRepository(CraneApplicationEvent)
    private readonly eventRepo: Repository<CraneApplicationEvent>,
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
    private readonly dataSource: DataSource,
    private readonly files: FilesService,
    private readonly referenceNumbers: ReferenceNumberService,
    private readonly spamCheck: SpamCheckService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // =======================================================================
  // Public — the form
  // =======================================================================

  async submit(
    dto: CreateCraneApplicationDto,
    context: SubmissionContext,
  ): Promise<{ referenceNo: string; message: string }> {
    const submittedAt = new Date();

    await this.assertCodesExist(dto);
    const job = await this.resolveJob(dto);

    const spam = await this.spamCheck.evaluate({
      email: dto.email,
      honeypot: dto.website,
      captchaToken: dto.captchaToken,
      ip: context.ip,
    });

    // One live application per person per role. A general application has no
    // job, so the check is on the track instead — otherwise someone could file
    // the same "keep me on file" record indefinitely.
    const duplicate = await this.applicationRepo.findOne({
      where: {
        email: dto.email.trim().toLowerCase(),
        siteCode: SITE_CODE,
        isDeleted: false,
        status: Not(In(CRANE_CLOSED_STATUSES)),
        ...(job ? { jobId: job.id } : { trackCode: dto.trackCode }),
      },
      select: ['id', 'referenceNo'],
    });

    if (duplicate) {
      throw new ConflictException(
        `You already have an application in progress (${duplicate.referenceNo}).`,
      );
    }

    const retentionUntil = new Date(submittedAt);
    retentionUntil.setMonth(retentionUntil.getMonth() + RETENTION_MONTHS);

    const application = await this.dataSource.transaction(async (manager) => {
      const referenceNo = await this.referenceNumbers.next(
        REFERENCE_PREFIX,
        REFERENCE_SEQUENCE,
        manager,
      );

      const saved = await manager.save(
        manager.create(CraneApplication, {
          referenceNo,
          siteCode: SITE_CODE,
          trackCode: dto.trackCode,
          jobId: job?.id ?? null,
          experienceBandCode: dto.experienceBandCode,
          availabilityCode: dto.availabilityCode ?? null,
          fullName: dto.fullName.trim(),
          nationality: dto.nationality.trim(),
          email: dto.email.trim().toLowerCase(),
          mobile: dto.mobile.trim(),
          currentLocation: dto.currentLocation?.trim() ?? null,
          residencyCode: dto.residencyCode,
          qualificationCode: dto.qualificationCode,
          workingLanguages: dto.workingLanguages,
          certifications: dto.certifications?.trim() ?? null,
          backgroundSummary: dto.backgroundSummary.trim(),
          // Suspected spam is stored, never rejected — a false positive must
          // not lose a real candidate.
          status: spam.isSpam ? 'REJECTED' : 'SUBMITTED',
          consentAt: submittedAt,
          privacyNoticeVersion: this.config.getOrThrow<string>(
            'PRIVACY_NOTICE_VERSION',
          ),
          retentionUntil,
          sourcePage: dto.sourcePage ?? null,
          ipHash: this.spamCheck.hashIp(context.ip),
          userAgent: context.userAgent ?? null,
          spamScore: spam.score,
        }),
      );

      await manager.save(
        manager.create(CraneApplicationEvent, {
          applicationId: saved.id,
          eventType: 'CREATED',
          actor: null,
          note: null,
          metadata: {
            spamScore: spam.score,
            spamReasons: spam.reasons,
            track: dto.trackCode,
            role: job?.title ?? 'General application',
          },
        }),
      );

      return saved;
    });

    if (!spam.isSpam) {
      await this.acknowledge(application, job);
    }

    this.logger.log(
      `Crane application ${application.referenceNo} — ${application.fullName}`,
    );

    return {
      referenceNo: application.referenceNo,
      message:
        `Thank you. Your reference is ${application.referenceNo}. ` +
        `Please reply to the acknowledgement email with your CV and any ` +
        `certifications attached — we cannot progress an application without them.`,
    };
  }

  // =======================================================================
  // Admin
  // =======================================================================

  async list(
    query: ListCraneApplicationsDto,
  ): Promise<PaginatedResult<CraneApplication>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.scoped()
      .select(LIST_COLUMNS)
      .orderBy('application.createdDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('application.status = :status', { status: query.status });
    }
    if (query.trackCode !== undefined) {
      qb.andWhere('application.trackCode = :trackCode', {
        trackCode: query.trackCode,
      });
    }
    if (query.jobId) {
      qb.andWhere('application.jobId = :jobId', { jobId: query.jobId });
    }
    if (query.awaitingCv) {
      qb.andWhere('application.cvFileId IS NULL');
    }
    if (query.overdue) {
      qb.andWhere('application.stageDueAt IS NOT NULL').andWhere(
        'application.stageDueAt < now()',
      );
    }
    if (query.search) {
      qb.andWhere(
        '(application.fullName ILIKE :q OR application.email ILIKE :q ' +
          'OR application.referenceNo ILIKE :q)',
        { q: `%${query.search}%` },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /** The full record — the withheld columns included. */
  async findById(id: string): Promise<CraneApplication> {
    const application = await this.scoped()
      .addSelect([
        'application.nationality',
        'application.mobile',
        'application.certifications',
        'application.backgroundSummary',
      ])
      .andWhere('application.id = :id', { id })
      .getOne();

    if (!application) {
      throw new NotFoundException(`Crane application ${id} not found`);
    }
    return application;
  }

  listEvents(id: string): Promise<CraneApplicationEvent[]> {
    return this.findById(id).then(() =>
      this.eventRepo.find({
        where: { applicationId: id },
        order: { createdDate: 'ASC' },
      }),
    );
  }

  /**
   * Move to the next stage, and reset the clock to that stage's promise.
   *
   * The deadlines are cumulative from the submission, matching how the page
   * words them — measuring each stage from its own start would let a slow
   * screening quietly push the final interview past the date the candidate
   * was given.
   */
  async setStatus(
    id: string,
    status: CraneApplicationStatus,
    note: string | undefined,
    actor: string,
  ): Promise<CraneApplication> {
    const application = await this.findById(id);
    const previous = application.status;

    const slaDays = STAGE_SLA_WORKING_DAYS[status];
    application.status = status;
    application.stageDueAt = slaDays
      ? addBusinessDays(application.createdDate, slaDays, KSA_CALENDAR)
      : null;

    await this.applicationRepo.save(application);

    await this.eventRepo.save(
      this.eventRepo.create({
        applicationId: id,
        eventType: 'STAGE_CHANGED',
        actor,
        note: note ?? null,
        metadata: { from: previous, to: status, dueAt: application.stageDueAt },
      }),
    );

    return this.findById(id);
  }

  /**
   * Attach the CV that arrived by email reply.
   *
   * Without this the CV lives only in an inbox — unretained, unsearchable, and
   * invisible to the twelve-month deletion the page promises. Bringing it onto
   * the record is what makes that promise keepable.
   */
  async attachCv(
    id: string,
    file: UploadedFile,
    actor: string,
  ): Promise<CraneApplication> {
    const application = await this.findById(id);

    if (application.cvFileId) {
      throw new ConflictException(
        'A CV is already attached. Remove it first if it needs replacing.',
      );
    }

    const stored = await this.files.upload(file, 'RESUME', null, SITE_CODE);

    application.cvFileId = stored.id;
    application.cvAttachedAt = new Date();
    await this.applicationRepo.save(application);

    await this.eventRepo.save(
      this.eventRepo.create({
        applicationId: id,
        eventType: 'CV_ATTACHED',
        actor,
        note: null,
        metadata: { fileId: stored.id, originalName: file.originalname },
      }),
    );

    return this.findById(id);
  }

  async assign(
    id: string,
    assignedTo: string | null | undefined,
    actor: string,
  ): Promise<CraneApplication> {
    const application = await this.findById(id);
    const previous = application.assignedTo;
    const next = assignedTo ?? null;

    application.assignedTo = next;
    application.assignedAt = next ? new Date() : null;
    await this.applicationRepo.save(application);

    await this.eventRepo.save(
      this.eventRepo.create({
        applicationId: id,
        eventType: next ? 'ASSIGNED' : 'UNASSIGNED',
        actor,
        note: null,
        metadata: { from: previous, to: next },
      }),
    );

    return this.findById(id);
  }

  async addNote(
    id: string,
    note: string,
    actor: string,
  ): Promise<CraneApplicationEvent> {
    await this.findById(id);
    return this.eventRepo.save(
      this.eventRepo.create({
        applicationId: id,
        eventType: 'NOTE_ADDED',
        actor,
        note,
        metadata: null,
      }),
    );
  }

  // =======================================================================
  // Internals
  // =======================================================================

  /** The one place an admin query is bound to the brand and to live rows. */
  private scoped() {
    return this.applicationRepo
      .createQueryBuilder('application')
      .where('application.siteCode = :siteCode', { siteCode: SITE_CODE })
      .andWhere('application.isDeleted = false');
  }

  /** A specific role is optional — one of the tracks is "keep on file". */
  private async resolveJob(
    dto: CreateCraneApplicationDto,
  ): Promise<CraneJobPosting | null> {
    if (!dto.jobId) return null;

    const job = await this.jobRepo.findOne({
      where: { id: dto.jobId, siteCode: SITE_CODE, isDeleted: false },
    });
    if (!job) throw new NotFoundException('That role was not found');
    if (job.status !== 'OPEN') {
      throw new GoneException('This role is no longer accepting applications');
    }
    if (job.closesAt && job.closesAt.getTime() <= Date.now()) {
      throw new GoneException('Applications for this role have closed');
    }
    return job;
  }

  private async assertCodesExist(
    dto: CreateCraneApplicationDto,
  ): Promise<void> {
    const live = { isActive: true, isDeleted: false };

    const [track, band, residency, qualification, availability] =
      await Promise.all([
        this.trackRepo.findOne({
          where: { trackCode: dto.trackCode, ...live },
        }),
        this.bandRepo.findOne({
          where: { bandCode: dto.experienceBandCode, ...live },
        }),
        this.residencyRepo.findOne({
          where: { residencyCode: dto.residencyCode, ...live },
        }),
        this.qualificationRepo.findOne({
          where: { qualificationCode: dto.qualificationCode, ...live },
        }),
        dto.availabilityCode
          ? this.availabilityRepo.findOne({
              where: { availabilityCode: dto.availabilityCode, ...live },
            })
          : Promise.resolve(true),
      ]);

    const unknown: string[] = [];
    if (!track) unknown.push(`trackCode ${dto.trackCode}`);
    if (!band) unknown.push(`experienceBandCode ${dto.experienceBandCode}`);
    if (!residency) unknown.push(`residencyCode ${dto.residencyCode}`);
    if (!qualification) {
      unknown.push(`qualificationCode ${dto.qualificationCode}`);
    }
    if (!availability) {
      unknown.push(`availabilityCode ${dto.availabilityCode}`);
    }

    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown or inactive: ${unknown.join(', ')}`,
      );
    }
  }

  /**
   * The acknowledgement, which is also the CV request.
   *
   * Unusually load-bearing: this email is the only route by which a CV ever
   * reaches the record, so until the mail transport is real, every application
   * arrives without one. Worth knowing before this goes live.
   */
  private async acknowledge(
    application: CraneApplication,
    job: CraneJobPosting | null,
  ): Promise<void> {
    await this.mail.send({
      to: application.email,
      subject: `Application received — ${application.referenceNo}`,
      body: [
        `Hello ${application.fullName},`,
        ``,
        `Thank you for applying${job ? ` for ${job.title}` : ''}.`,
        `Your reference is ${application.referenceNo}.`,
        ``,
        `Please REPLY TO THIS EMAIL with your CV attached, along with any`,
        `certifications relevant to the role. We cannot progress an application`,
        `without them.`,
        ``,
        `What happens next:`,
        `  CV screening        within 5 working days`,
        `  Technical interview within 2 weeks`,
        `  Final interview     within 3 weeks`,
        `  Offer and onboarding within 4 weeks`,
        ``,
        `Your profile is retained for 12 months under the Saudi PDPL.`,
        ``,
        `— Veltrixair Industries`,
      ].join('\n'),
      replyTo: CAREERS_INBOX,
    });

    await this.mail.send({
      to: CAREERS_INBOX,
      subject: `[${application.referenceNo}] ${application.fullName} — crane application`,
      body: [
        `New application ${application.referenceNo}`,
        ``,
        `Name:  ${application.fullName}`,
        `Email: ${application.email}`,
        `Role:  ${job ? `${job.refCode} — ${job.title}` : 'General application'}`,
        ``,
        `Open it in the admin panel — nationality, residency and background are`,
        `deliberately withheld from this email.`,
      ].join('\n'),
      replyTo: application.email,
    });

    await this.applicationRepo.update(
      { id: application.id },
      { acknowledgedAt: new Date() },
    );

    await this.eventRepo.save(
      this.eventRepo.create({
        applicationId: application.id,
        eventType: 'ACKNOWLEDGED',
        actor: null,
        note: null,
        metadata: { to: application.email },
      }),
    );
  }
}
