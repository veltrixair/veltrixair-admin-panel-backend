import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { JobPosting } from '../careers/entities/job-posting.entity';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ReferenceNumberService } from '../common/services/reference-number.service';
import { SpamCheckService } from '../common/services/spam-check.service';
import { joinPhone } from '../common/utils/phone.util';
import { FilesService } from '../files/files.service';
import type { UploadedFile } from '../files/files.service';
import { FEATURE } from '../auth/permissions.constants';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notifications/notification.service';
import { MasterDataService } from '../master-data/master-data.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { JobApplicationEvent } from './entities/job-application-event.entity';
import type { ApplicationEventType } from './entities/job-application-event.entity';
import {
  CLOSED_STATUSES,
  JobApplication,
} from './entities/job-application.entity';
import type { ApplicationStatus } from './entities/job-application.entity';
import {
  APPLICATION_FIELDS,
  APPLICATION_FIELD_KEYS,
  resolveFields,
} from './application-fields.constants';

const REFERENCE_PREFIX = 'VLX-APP';

const REFERENCE_SEQUENCE = 'job_application_ref_seq';

export interface ApplicationResult {
  referenceNo: string;
  manageToken: string;
  /** Null on a general application — there is no role to name. */
  jobTitle: string | null;
  message: string;
}

/** What the candidate sees through their manage link — no PII beyond their own. */
export interface CandidateView {
  referenceNo: string;
  jobTitle: string | null;
  status: ApplicationStatus;
  appliedAt: Date;
  withdrawnAt: Date | null;
  canWithdraw: boolean;
}

@Injectable()
export class ApplicationService {
  /**
   * Refuses answers the posting did not ask for, and demands the ones it
   * marked required.
   *
   * This is the half of the toggle feature that cannot live in the browser.
   * Without it a switched-off question still lands in the table when someone
   * posts directly or from a stale form, and "required" is a suggestion.
   */
  private assertMatchesFieldConfig(
    dto: CreateApplicationDto,
    job: JobPosting | null,
  ): void {
    // A general application has no posting to read, so it is held to the
    // defaults — which are what the website's form draws anyway.
    const fields = resolveFields(job?.applicationFields ?? null);
    const problems: string[] = [];

    for (const key of APPLICATION_FIELD_KEYS) {
      const { on, required } = fields[key];
      const { label, properties } = APPLICATION_FIELDS[key];

      const answered = properties.filter((property) => {
        const value = (dto as unknown as Record<string, unknown>)[property];
        if (value === undefined || value === null || value === '') return false;
        return !(Array.isArray(value) && value.length === 0);
      });

      if (!on && answered.length > 0) {
        problems.push(`"${label}" is not asked for this role`);
        continue;
      }
      if (on && required && answered.length === 0) {
        problems.push(`"${label}" is required for this role`);
      }
    }

    if (problems.length > 0) {
      throw new BadRequestException(problems);
    }
  }
  private readonly logger = new Logger(ApplicationService.name);

  constructor(
    @InjectRepository(JobApplication)
    private readonly applicationRepo: Repository<JobApplication>,
    @InjectRepository(JobApplicationEvent)
    private readonly eventRepo: Repository<JobApplicationEvent>,
    @InjectRepository(JobPosting)
    private readonly jobRepo: Repository<JobPosting>,
    private readonly dataSource: DataSource,
    private readonly files: FilesService,
    private readonly masterData: MasterDataService,
    private readonly referenceNumbers: ReferenceNumberService,
    private readonly spamCheck: SpamCheckService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  // =======================================================================
  // Public — applying
  // =======================================================================

  /**
   * Submit an application.
   *
   * Order matters. Everything cheap and rejectable happens *before* the résumé
   * reaches Supabase, because once an object is stored, a later failure leaves
   * a file nobody has a row for. The upload is the last thing before the
   * transaction, and a failure after it triggers a compensating delete.
   */
  async submit(
    slug: string | null,
    dto: CreateApplicationDto,
    resume: UploadedFile,
    context: { ip?: string; userAgent?: string },
    siteCode: number,
  ): Promise<ApplicationResult> {
    /*
     * 1. The job, when there is one.
     *
     * A null slug is a general application — somebody answering "Be A Part Of
     * Our Journey" rather than a vacancy. The rest of this method is identical
     * either way, which is why it branches here instead of being copied: the
     * résumé policy, the spam scoring, the retention clock and the compensating
     * delete are the parts worth not having two versions of.
     */
    const job = slug
      ? await this.jobRepo.findOne({
          where: { slug, isDeleted: false, siteCode },
        })
      : null;

    if (slug) {
      if (!job) throw new NotFoundException(`No role found for "${slug}"`);

      if (job.status !== 'OPEN') {
        throw new GoneException(
          'This role is no longer accepting applications',
        );
      }
      if (job.closesAt && job.closesAt.getTime() <= Date.now()) {
        throw new GoneException('Applications for this role have closed');
      }
    }

    // 2. What this role actually asks. A question the recruiter switched
    //    off is refused rather than quietly stored, and one they marked
    //    required is refused when missing — neither of which the DTO can
    //    know, because both are properties of the posting.
    this.assertMatchesFieldConfig(dto, job);

    // 3. Every coded field, validated in one round trip.
    await this.masterData.assertApplicationCodes({
      qualificationCode: dto.qualificationCode ?? null,
      noticePeriodCode: dto.noticePeriodCode ?? null,
      workAuthorisationCode: dto.workAuthorisationCode ?? null,
      sourceCode: dto.sourceCode ?? null,
    });

    // Bands are validated separately because this lookup returns something:
    // the years figure the admin list filters on, read off the chosen band.
    const experience = await this.masterData.resolveExperienceBands({
      experienceBandCode: dto.experienceBandCode ?? null,
      relevantExperienceBandCode: dto.relevantExperienceBandCode ?? null,
    });

    // A salary without a currency is meaningless across three markets.
    if (dto.expectedSalary !== undefined && !dto.salaryCurrency) {
      throw new ConflictException(
        'Provide salaryCurrency (e.g. SAR, AED, INR) alongside expectedSalary',
      );
    }

    /*
     * 3. One live application per person per role — and one live general
     *    application per person per site.
     *
     * `IsNull()` rather than `jobId: null`: in SQL `NULL = NULL` is never true,
     * so matching on the value would find nothing and the guard would silently
     * stop existing for exactly the path that has no posting to key on.
     */
    const existing = await this.applicationRepo.findOne({
      where: {
        email: dto.email.trim().toLowerCase(),
        jobId: job ? job.id : IsNull(),
        siteCode,
        isDeleted: false,
        status: Not(In(CLOSED_STATUSES)),
      },
      select: ['id', 'referenceNo'],
    });

    if (existing) {
      throw new ConflictException(
        job
          ? `You already have an application in progress for this role (${existing.referenceNo}).`
          : `You already have a general application with us (${existing.referenceNo}). ` +
              'Use the link in your confirmation email to check or withdraw it.',
      );
    }

    // 4. Spam scoring — same service the contact form uses.
    const spam = await this.spamCheck.evaluate({
      email: dto.email,
      honeypot: dto.website,
      captchaToken: dto.captchaToken,
      ip: context.ip,
    });

    // 5. Only now does anything leave the process. FilesService applies the
    //    RESUME policy: 5 MB, pdf/doc/docx by magic bytes, 12-month retention.
    const stored = await this.files.upload(resume, 'RESUME', null, siteCode);

    try {
      const application = await this.dataSource.transaction(async (manager) => {
        const referenceNo = await this.referenceNumbers.next(
          REFERENCE_PREFIX,
          REFERENCE_SEQUENCE,
          manager,
        );

        const saved = await manager.save(
          manager.create(JobApplication, {
            referenceNo,
            jobId: job?.id ?? null,
            siteCode,
            fullName: dto.fullName.trim(),
            email: dto.email.trim().toLowerCase(),
            phone: joinPhone(dto.phoneCode, dto.phone),
            currentTitle: dto.currentTitle?.trim() ?? null,
            currentCompany: dto.currentCompany?.trim() ?? null,
            qualificationCode: dto.qualificationCode ?? null,
            experienceBandCode: dto.experienceBandCode ?? null,
            relevantExperienceBandCode: dto.relevantExperienceBandCode ?? null,
            experienceYears: experience.experienceYears,
            relevantExperienceYears: experience.relevantExperienceYears,
            keySkills: dto.keySkills?.length ? dto.keySkills : null,
            linkedinUrl: dto.linkedinUrl ?? null,
            portfolioUrl: dto.portfolioUrl ?? null,
            city: dto.city?.trim() ?? null,
            currentCountry: dto.currentCountry ?? null,
            noticePeriodCode: dto.noticePeriodCode ?? null,
            workAuthorisationCode: dto.workAuthorisationCode ?? null,
            willingToRelocate: dto.willingToRelocate ?? null,
            currentCtc: dto.currentCtc?.trim() ?? null,
            currentCtcCurrency: dto.currentCtcCurrency ?? null,
            expectedSalary: dto.expectedSalary ?? null,
            salaryCurrency: dto.salaryCurrency ?? null,
            resumeFileId: stored.id,
            coverNote: dto.coverNote ?? null,
            sourceCode: dto.sourceCode ?? null,
            status: 'NEW',
            manageToken: randomBytes(24).toString('hex'),
            consentAt: new Date(),
            privacyNoticeVersion: this.config.getOrThrow<string>(
              'PRIVACY_NOTICE_VERSION',
            ),
            sourcePage: dto.sourcePage ?? null,
            ipHash: this.spamCheck.hashIp(context.ip),
            userAgent: context.userAgent ?? null,
            spamScore: spam.score,
          }),
        );

        await manager.save(
          manager.create(JobApplicationEvent, {
            applicationId: saved.id,
            eventType: 'CREATED',
            actor: null,
            note: job
              ? `Applied for ${job.title}`
              : 'General application — no specific role',
            metadata: {
              spamScore: spam.score,
              spamReasons: spam.reasons,
              resumeFileId: stored.id,
            },
          }),
        );

        return saved;
      });

      await this.sendConfirmation(application, job?.title ?? null);

      /*
       * IT_APPLICATIONS, not IT_CAREERS: publishing a vacancy and reading who
       * applied are separate permissions, because an application carries a
       * candidate's name, CV and contact details. A recruiter who may only
       * edit adverts should not learn from the bell who is applying.
       */
      await this.notifications.raise({
        siteCode,
        featureCode: FEATURE.IT_APPLICATIONS,
        category: 'jobs',
        lead: job ? 'Job application' : 'General application',
        body: job
          ? `${application.fullName} applied for ${job.title}`
          : `${application.fullName} applied speculatively`,
        link: `/candidates/${application.id}`,
        sourceType: 'job_application',
        sourceId: application.id,
      });

      this.logger.log(
        `Application ${application.referenceNo} for "${job?.title ?? 'general'}" (spam score ${spam.score})`,
      );

      return {
        referenceNo: application.referenceNo,
        manageToken: application.manageToken,
        jobTitle: job?.title ?? null,
        message: job
          ? 'Thank you. Your application has been received — we review every one and will be in touch.'
          : 'Thank you. Your profile is with our talent team — we will be in touch when something fits.',
      };
    } catch (error) {
      // The row failed but the object is already in Supabase. Remove it, or it
      // becomes storage nobody can account for and the retention purge has no
      // row to work from.
      await this.files
        .remove(stored.id)
        .catch((cleanupError: unknown) =>
          this.logger.error(
            `Orphaned résumé ${stored.id} could not be removed: ${String(cleanupError)}`,
          ),
        );
      throw error;
    }
  }

  // =======================================================================
  // Public — the candidate's own view, via their emailed link
  // =======================================================================

  async findByToken(token: string): Promise<CandidateView> {
    const application = await this.applicationRepo.findOne({
      where: { manageToken: token, isDeleted: false },
      relations: { job: true },
    });

    if (!application) throw new NotFoundException('Application not found');

    return {
      referenceNo: application.referenceNo,
      jobTitle: application.job?.title ?? null,
      status: application.status,
      appliedAt: application.createdDate,
      withdrawnAt: application.withdrawnAt,
      canWithdraw: !CLOSED_STATUSES.includes(application.status),
    };
  }

  /**
   * Withdraw, and delete the résumé with it.
   *
   * A withdrawal is a revocation of consent, so waiting for the 12-month
   * retention date would be keeping a CV on a basis the candidate has just
   * taken back. The application row survives — without it there is no record
   * that the data ever existed or that it was deleted on request, which is
   * exactly what an erasure enquiry asks you to evidence.
   */
  async withdraw(token: string): Promise<{ message: string }> {
    const application = await this.applicationRepo.findOne({
      where: { manageToken: token, isDeleted: false },
    });

    if (!application) throw new NotFoundException('Application not found');

    if (CLOSED_STATUSES.includes(application.status)) {
      throw new ConflictException(
        application.status === 'WITHDRAWN'
          ? 'This application has already been withdrawn'
          : 'This application is already closed',
      );
    }

    const resumeFileId = application.resumeFileId;

    await this.applicationRepo.update(
      { id: application.id },
      {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
        resumeFileId: null,
        coverNote: null,
      },
    );

    await this.eventRepo.save(
      this.eventRepo.create({
        applicationId: application.id,
        eventType: 'WITHDRAWN',
        actor: null,
        note: 'Withdrawn by the candidate; résumé deleted',
      }),
    );

    // Detached from the row first, so a storage failure cannot leave the
    // application pointing at a file that is half-deleted.
    if (resumeFileId) {
      await this.files
        .remove(resumeFileId)
        .catch((error: unknown) =>
          this.logger.error(
            `Résumé ${resumeFileId} could not be deleted on withdrawal: ${String(error)}`,
          ),
        );
    }

    this.logger.log(`Application ${application.referenceNo} withdrawn`);

    return {
      message:
        'Your application has been withdrawn and your résumé deleted from our systems.',
    };
  }

  // =======================================================================
  // Admin
  // =======================================================================

  async list(
    query: ListApplicationsDto,
    siteCode: number,
  ): Promise<PaginatedResult<JobApplication>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.applicationRepo
      .createQueryBuilder('application')
      .leftJoinAndSelect('application.job', 'job')
      .leftJoinAndSelect('application.qualification', 'qualification')
      .leftJoinAndSelect('application.noticePeriod', 'noticePeriod')
      .leftJoinAndSelect('application.workAuthorisation', 'workAuthorisation')
      .leftJoinAndSelect('application.experienceBand', 'experienceBand')
      .leftJoinAndSelect(
        'application.relevantExperienceBand',
        'relevantExperienceBand',
      )
      .where('application.isDeleted = false')
      .andWhere('application.siteCode = :siteCode', { siteCode });

    if (query.search) {
      qb.andWhere(
        `(application.fullName ILIKE :search
          OR application.email ILIKE :search
          OR application.referenceNo ILIKE :search)`,
        { search: `%${query.search}%` },
      );
    }
    if (query.jobId) {
      qb.andWhere('application.jobId = :jobId', { jobId: query.jobId });
    }
    if (query.kind) {
      /* IS NULL rather than a flag column: the absence of a job IS the fact. */
      qb.andWhere(
        query.kind === 'GENERAL'
          ? 'application.jobId IS NULL'
          : 'application.jobId IS NOT NULL',
      );
    }
    if (query.status) {
      qb.andWhere('application.status = :status', { status: query.status });
    }
    if (query.noticePeriodCode !== undefined) {
      qb.andWhere('application.noticePeriodCode = :np', {
        np: query.noticePeriodCode,
      });
    }
    if (query.workAuthorisationCode !== undefined) {
      qb.andWhere('application.workAuthorisationCode = :wa', {
        wa: query.workAuthorisationCode,
      });
    }
    if (query.minExperienceYears !== undefined) {
      qb.andWhere('application.experienceYears >= :minExp', {
        minExp: query.minExperienceYears,
      });
    }

    const [items, total] = await qb
      .orderBy('application.createdDate', 'DESC')
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

  /** The full record, including the columns held back from the list view. */
  /** Choke point: detail, résumé links, status, assign and notes all use it. */
  async findById(id: string, siteCode: number): Promise<JobApplication> {
    const application = await this.applicationRepo
      .createQueryBuilder('application')
      .leftJoinAndSelect('application.job', 'job')
      .leftJoinAndSelect('application.qualification', 'qualification')
      .leftJoinAndSelect('application.noticePeriod', 'noticePeriod')
      .leftJoinAndSelect('application.workAuthorisation', 'workAuthorisation')
      .leftJoinAndSelect('application.experienceBand', 'experienceBand')
      .leftJoinAndSelect(
        'application.relevantExperienceBand',
        'relevantExperienceBand',
      )
      .leftJoinAndSelect('application.resumeFile', 'resumeFile')
      .addSelect([
        'application.phone',
        'application.coverNote',
        'application.expectedSalary',
        'application.salaryCurrency',
        // Withheld from the list for the same reason as the rest of this
        // block, and released here. The currency is useless without the
        // amount and the amount misleading without the currency, so both.
        'application.currentCtc',
        'application.currentCtcCurrency',
      ])
      .where('application.id = :id', { id })
      .andWhere('application.isDeleted = false')
      .andWhere('application.siteCode = :siteCode', { siteCode })
      .getOne();

    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  /**
   * A short-lived signed URL for the CV, and a record that it was issued.
   *
   * The résumé is the most sensitive thing a candidate hands over, so who asked
   * for it is logged — the same treatment NDA-flagged enquiry messages get.
   */
  async resumeUrl(
    id: string,
    actor: string | null,
    siteCode: number,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const application = await this.applicationRepo.findOne({
      where: { id, isDeleted: false, siteCode },
    });

    if (!application) throw new NotFoundException('Application not found');

    if (!application.resumeFileId) {
      throw new GoneException(
        application.status === 'WITHDRAWN'
          ? 'The résumé was deleted when this application was withdrawn'
          : 'No résumé is attached to this application',
      );
    }

    const link = await this.files.downloadUrl(
      application.resumeFileId,
      siteCode,
    );

    await this.eventRepo.save(
      this.eventRepo.create({
        applicationId: id,
        eventType: 'RESUME_VIEWED',
        actor,
        note: 'Download link issued',
      }),
    );

    return link;
  }

  async setStatus(
    id: string,
    status: Exclude<ApplicationStatus, 'WITHDRAWN'>,
    note: string | undefined,
    actor: string | null,
    siteCode: number,
  ): Promise<JobApplication> {
    const application = await this.applicationRepo.findOne({
      where: { id, isDeleted: false, siteCode },
    });

    if (!application) throw new NotFoundException('Application not found');

    // A candidate's withdrawal is theirs, not a state a recruiter can undo.
    if (application.status === 'WITHDRAWN') {
      throw new ForbiddenException(
        'This application was withdrawn by the candidate and cannot be reopened',
      );
    }

    const previous = application.status;
    if (previous === status) return this.findById(id, siteCode);

    await this.applicationRepo.update({ id }, { status });

    await this.eventRepo.save(
      this.eventRepo.create({
        applicationId: id,
        eventType: 'STATUS_CHANGED',
        actor,
        note: note ?? null,
        metadata: { from: previous, to: status },
      }),
    );

    return this.findById(id, siteCode);
  }

  async assign(
    id: string,
    assignedTo: string,
    actor: string | null,
    siteCode: number,
  ): Promise<JobApplication> {
    const application = await this.applicationRepo.findOne({
      where: { id, isDeleted: false, siteCode },
    });
    if (!application) throw new NotFoundException('Application not found');

    await this.applicationRepo.update({ id }, { assignedTo });
    await this.recordEvent(id, 'ASSIGNED', actor, `Assigned to ${assignedTo}`);

    return this.findById(id, siteCode);
  }

  async addNote(
    id: string,
    note: string,
    actor: string | null,
    siteCode: number,
  ): Promise<JobApplicationEvent> {
    const exists = await this.applicationRepo.findOne({
      where: { id, isDeleted: false, siteCode },
      select: ['id'],
    });
    if (!exists) throw new NotFoundException('Application not found');

    return this.recordEvent(id, 'NOTE_ADDED', actor, note);
  }

  /**
   * Events carry no site of their own, so the parent is loaded first. Reading
   * them by id alone would hand another brand's timeline to anyone with a uuid.
   */
  async listEvents(
    id: string,
    siteCode: number,
  ): Promise<JobApplicationEvent[]> {
    await this.findById(id, siteCode);
    return this.eventRepo.find({
      where: { applicationId: id },
      order: { createdDate: 'ASC' },
    });
  }

  // =======================================================================
  // Internals
  // =======================================================================

  private recordEvent(
    applicationId: string,
    eventType: ApplicationEventType,
    actor: string | null,
    note: string | null,
  ): Promise<JobApplicationEvent> {
    return this.eventRepo.save(
      this.eventRepo.create({ applicationId, eventType, actor, note }),
    );
  }

  private async sendConfirmation(
    application: JobApplication,
    jobTitle: string | null,
  ): Promise<void> {
    await this.mail.send({
      to: application.email,
      subject: `We've received your application — ${application.referenceNo}`,
      body: [
        `Hello ${application.fullName},`,
        ``,
        // A general applicant did not apply "for" anything, and saying they
        // did is the sort of small wrongness that reads as a mail merge.
        jobTitle
          ? `Thank you for applying for ${jobTitle}. Your reference is ${application.referenceNo}.`
          : `Thank you for your interest in joining Veltrixair. Your profile is now with our talent team, and your reference is ${application.referenceNo}.`,
        ``,
        jobTitle
          ? `We read every application. If your experience matches what the team needs, we will be in touch to arrange a first conversation.`
          : `We read every application. We will be in touch when a role comes up that fits what you do.`,
        ``,
        `Check the status or withdraw your application at any time:`,
        `/careers/applications/${application.manageToken}`,
        ``,
        `Withdrawing deletes your résumé from our systems immediately. Otherwise we keep it for twelve months and then delete it automatically.`,
      ].join('\n'),
    });

    await this.recordEvent(
      application.id,
      'NOTIFICATION_SENT',
      null,
      'Confirmation sent to the candidate',
    );
  }
}
