import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/pagination-query.dto';
import { ReferenceNumberService } from '../../common/services/reference-number.service';
import { SpamCheckService } from '../../common/services/spam-check.service';
import { addBusinessDays } from '../../common/utils/business-hours.util';
import type { WorkingCalendar } from '../../common/utils/business-hours.util';
import { FilesService } from '../../files/files.service';
import type { UploadedFile } from '../../files/files.service';
import { MailService } from '../../mail/mail.service';
import { IndustryMaster } from '../../master-data/entities/industry-master.entity';
import {
  HOTLINE,
  QUOTES_INBOX,
  SCOPE_SCHEMAS,
  SLA_WORKING_DAYS,
  derivePriority,
} from './crane-quote.constants';
import type { QuotePriority } from './crane-quote.constants';
import { CreateCraneQuoteDto } from './dto/create-crane-quote.dto';
import { ListCraneQuotesDto } from './dto/list-crane-quotes.dto';
import { CraneBudgetBandMaster } from '../masters/entities/crane-budget-band-master.entity';
import { CraneCompletionTimelineMaster } from '../masters/entities/crane-completion-timeline-master.entity';
import { CraneDutyClassMaster } from '../masters/entities/crane-duty-class-master.entity';
import { CraneEnvironmentMaster } from '../masters/entities/crane-environment-master.entity';
import { CraneLeadSourceMaster } from '../masters/entities/crane-lead-source-master.entity';
import { CraneOemMaster } from '../masters/entities/crane-oem-master.entity';
import { CranePaymentTermsMaster } from '../masters/entities/crane-payment-terms-master.entity';
import { CraneProcurementMaster } from '../masters/entities/crane-procurement-master.entity';
import { CraneProposalDocMaster } from '../masters/entities/crane-proposal-doc-master.entity';
import { CraneQuoteEvent } from './entities/crane-quote-event.entity';
import type { QuoteEventType } from './entities/crane-quote-event.entity';
import { CraneQuoteRequest } from './entities/crane-quote-request.entity';
import type { QuoteStatus } from './entities/crane-quote-request.entity';
import { CraneServiceLineMaster } from '../masters/entities/crane-service-line-master.entity';
import { CraneSiteAccessMaster } from '../masters/entities/crane-site-access-master.entity';
import { CraneSiteCityMaster } from '../masters/entities/crane-site-city-master.entity';
import { CraneTypeMaster } from '../masters/entities/crane-type-master.entity';
import { CraneUrgencyMaster } from '../masters/entities/crane-urgency-master.entity';

/** Veltrixair Industries. Every row this module writes belongs to it. */
const SITE_CODE = 102;

const REFERENCE_PREFIX = 'VTX-RFQ';
const REFERENCE_SEQUENCE = 'crane_quote_ref_seq';

/**
 * KSA working week: Sunday to Thursday. The SLA promises on the quote page are
 * in working days, so they have to be counted the way Riyadh counts them —
 * a Thursday afternoon submission is not due back on Saturday.
 */
const KSA_CALENDAR: WorkingCalendar = {
  timezone: 'Asia/Riyadh',
  workingDays: [0, 1, 2, 3, 4],
  workStartHour: 8,
  workEndHour: 17,
};

export interface QuoteOption {
  code: number;
  label: string;
}

export interface QuoteFormOptions {
  serviceLines: QuoteOption[];
  urgencies: QuoteOption[];
  leadSources: QuoteOption[];
  industries: QuoteOption[];
  siteCities: QuoteOption[];
  siteAccessRegimes: QuoteOption[];
  craneTypes: QuoteOption[];
  oems: QuoteOption[];
  environments: QuoteOption[];
  dutyClasses: QuoteOption[];
  budgetBands: QuoteOption[];
  completionTimelines: QuoteOption[];
  procurementProcesses: QuoteOption[];
  paymentTerms: QuoteOption[];
  proposalDocuments: QuoteOption[];
  /** Which section-04 questions apply to each service line. */
  scopeQuestions: Record<number, Record<string, string[] | 'TEXT'>>;
}

export interface QuoteResult {
  referenceNo: string;
  manageToken: string;
  priority: QuotePriority;
  triageDueAt: Date;
  proposalDueAt: Date;
  message: string;
  /** Present only for a production stop. */
  hotline?: string;
}

export interface CustomerQuoteView {
  referenceNo: string;
  status: QuoteStatus;
  priority: QuotePriority;
  serviceLine: string | null;
  submittedAt: Date;
  proposalDueAt: Date;
}

@Injectable()
export class CraneQuoteService implements OnModuleInit {
  private readonly logger = new Logger(CraneQuoteService.name);

  constructor(
    @InjectRepository(CraneQuoteRequest)
    private readonly quoteRepo: Repository<CraneQuoteRequest>,
    @InjectRepository(CraneQuoteEvent)
    private readonly eventRepo: Repository<CraneQuoteEvent>,
    @InjectRepository(CraneServiceLineMaster)
    private readonly serviceLineRepo: Repository<CraneServiceLineMaster>,
    @InjectRepository(CraneUrgencyMaster)
    private readonly urgencyRepo: Repository<CraneUrgencyMaster>,
    @InjectRepository(CraneLeadSourceMaster)
    private readonly leadSourceRepo: Repository<CraneLeadSourceMaster>,
    @InjectRepository(CraneSiteCityMaster)
    private readonly siteCityRepo: Repository<CraneSiteCityMaster>,
    @InjectRepository(CraneSiteAccessMaster)
    private readonly siteAccessRepo: Repository<CraneSiteAccessMaster>,
    @InjectRepository(CraneTypeMaster)
    private readonly craneTypeRepo: Repository<CraneTypeMaster>,
    @InjectRepository(CraneOemMaster)
    private readonly oemRepo: Repository<CraneOemMaster>,
    @InjectRepository(CraneEnvironmentMaster)
    private readonly environmentRepo: Repository<CraneEnvironmentMaster>,
    @InjectRepository(CraneDutyClassMaster)
    private readonly dutyClassRepo: Repository<CraneDutyClassMaster>,
    @InjectRepository(CraneBudgetBandMaster)
    private readonly budgetRepo: Repository<CraneBudgetBandMaster>,
    @InjectRepository(CraneCompletionTimelineMaster)
    private readonly timelineRepo: Repository<CraneCompletionTimelineMaster>,
    @InjectRepository(CraneProcurementMaster)
    private readonly procurementRepo: Repository<CraneProcurementMaster>,
    @InjectRepository(CranePaymentTermsMaster)
    private readonly paymentRepo: Repository<CranePaymentTermsMaster>,
    @InjectRepository(CraneProposalDocMaster)
    private readonly proposalDocRepo: Repository<CraneProposalDocMaster>,
    @InjectRepository(IndustryMaster)
    private readonly industryRepo: Repository<IndustryMaster>,
    private readonly dataSource: DataSource,
    private readonly files: FilesService,
    private readonly referenceNumbers: ReferenceNumberService,
    private readonly spamCheck: SpamCheckService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.assertScopeSchemasCoverServiceLines();
  }

  /**
   * Warns at boot about any live service line with no Section 04 questionnaire.
   *
   * Seeding a service line is a migration; adding its questionnaire is a change
   * to crane-quote.constants.ts. Nothing links the two, so they can drift — and
   * without this the first sign would be a customer getting a 500 from
   * validateScope(). Deliberately does not stop the application: a gap on one
   * service line is no reason to take the other six offline, and a database
   * that is briefly unreachable at boot is not a configuration error at all.
   */
  private async assertScopeSchemasCoverServiceLines(): Promise<void> {
    try {
      const lines = await this.serviceLineRepo.find({
        where: { isActive: true, isDeleted: false },
      });
      const missing = lines.filter(
        (line) => !SCOPE_SCHEMAS[line.serviceLineCode],
      );

      if (missing.length > 0) {
        this.logger.error(
          `No Section 04 questionnaire for service line(s): ` +
            missing
              .map((l) => `${l.serviceLineCode} (${l.serviceLineName})`)
              .join(', ') +
            `. Quote requests naming them will be refused until SCOPE_SCHEMAS ` +
            `in crane-quote.constants.ts covers them.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not check scope schema coverage at start-up: ${(error as Error).message}`,
      );
    }
  }

  // =======================================================================
  // Public — the form
  // =======================================================================

  /** Every dropdown on the quote form, plus the conditional question map. */
  async formOptions(): Promise<QuoteFormOptions> {
    const live = {
      where: { isActive: true, isDeleted: false },
      order: { displayOrder: 'ASC' as const },
    };

    const [
      serviceLines,
      urgencies,
      leadSources,
      siteCities,
      siteAccess,
      craneTypes,
      oems,
      environments,
      dutyClasses,
      budgets,
      timelines,
      procurements,
      payments,
      proposalDocs,
      industries,
    ] = await Promise.all([
      this.serviceLineRepo.find(live),
      this.urgencyRepo.find(live),
      this.leadSourceRepo.find(live),
      this.siteCityRepo.find(live),
      this.siteAccessRepo.find(live),
      this.craneTypeRepo.find(live),
      this.oemRepo.find(live),
      this.environmentRepo.find(live),
      this.dutyClassRepo.find(live),
      this.budgetRepo.find(live),
      this.timelineRepo.find(live),
      this.procurementRepo.find(live),
      this.paymentRepo.find(live),
      this.proposalDocRepo.find(live),
      // Industries are a SHARED table with a per-brand range, so this one is
      // filtered by site rather than being a crane-only table.
      this.industryRepo.find({
        where: { isActive: true, isDeleted: false, siteCode: SITE_CODE },
        order: { displayOrder: 'ASC' },
      }),
    ]);

    const scopeQuestions: Record<
      number,
      Record<string, string[] | 'TEXT'>
    > = {};
    for (const [line, questions] of Object.entries(SCOPE_SCHEMAS)) {
      scopeQuestions[Number(line)] = Object.fromEntries(
        Object.entries(questions).map(([key, q]) => [
          key,
          q.values === 'TEXT' ? 'TEXT' : [...q.values],
        ]),
      );
    }

    return {
      serviceLines: serviceLines.map((r) => ({
        code: r.serviceLineCode,
        label: r.serviceLineName,
      })),
      urgencies: urgencies.map((r) => ({
        code: r.urgencyCode,
        label: r.urgencyName,
      })),
      leadSources: leadSources.map((r) => ({
        code: r.leadSourceCode,
        label: r.leadSourceName,
      })),
      industries: industries.map((r) => ({
        code: r.industryCode,
        label: r.industryName,
      })),
      siteCities: siteCities.map((r) => ({
        code: r.siteCityCode,
        label: r.siteCityName,
      })),
      siteAccessRegimes: siteAccess.map((r) => ({
        code: r.siteAccessCode,
        label: r.siteAccessName,
      })),
      craneTypes: craneTypes.map((r) => ({
        code: r.craneTypeCode,
        label: r.craneTypeName,
      })),
      oems: oems.map((r) => ({ code: r.oemCode, label: r.oemName })),
      environments: environments.map((r) => ({
        code: r.environmentCode,
        label: r.environmentName,
      })),
      dutyClasses: dutyClasses.map((r) => ({
        code: r.dutyClassCode,
        label: r.dutyClassName,
      })),
      budgetBands: budgets.map((r) => ({
        code: r.budgetBandCode,
        label: r.budgetBandName,
      })),
      completionTimelines: timelines.map((r) => ({
        code: r.completionTimelineCode,
        label: r.completionTimelineName,
      })),
      procurementProcesses: procurements.map((r) => ({
        code: r.procurementCode,
        label: r.procurementName,
      })),
      paymentTerms: payments.map((r) => ({
        code: r.paymentTermsCode,
        label: r.paymentTermsName,
      })),
      proposalDocuments: proposalDocs.map((r) => ({
        code: r.proposalDocCode,
        label: r.proposalDocName,
      })),
      scopeQuestions,
    };
  }

  /**
   * Submit a quote request.
   *
   * Same ordering discipline as job applications: everything cheap and
   * rejectable happens before any attachment reaches storage, because an
   * object stored against a row that never gets written is a file nobody can
   * account for. Failures after the upload trigger a compensating delete.
   */
  async submit(
    dto: CreateCraneQuoteDto,
    attachments: UploadedFile[],
    context: { ip?: string; userAgent?: string },
  ): Promise<QuoteResult> {
    await this.assertCodesExist(dto);
    const scopeDetail = this.validateScope(
      dto.serviceLineCode,
      dto.scopeDetail,
    );

    const spam = await this.spamCheck.evaluate({
      email: dto.businessEmail,
      honeypot: dto.website,
      captchaToken: dto.captchaToken,
      ip: context.ip,
    });

    const priority = derivePriority(dto.urgencyCode, scopeDetail);
    const now = new Date();
    const sla = SLA_WORKING_DAYS[priority];

    // Zero working days means "immediately" — a production stop does not get a
    // due date tomorrow morning.
    const due = (days: number) =>
      days < 1 ? now : addBusinessDays(now, days, KSA_CALENDAR);

    const stored: { id: string }[] = [];
    for (const file of attachments) {
      stored.push(
        await this.files.upload(file, 'QUOTE_ATTACHMENT', null, SITE_CODE),
      );
    }

    try {
      const quote = await this.dataSource.transaction(async (manager) => {
        // Four digits, matching the VTX-RFQ-2026-XXXX shown on the page.
        const referenceNo = await this.referenceNumbers.next(
          REFERENCE_PREFIX,
          REFERENCE_SEQUENCE,
          manager,
          4,
        );

        const saved = await manager.save(
          manager.create(CraneQuoteRequest, {
            referenceNo,
            siteCode: SITE_CODE,
            serviceLineCode: dto.serviceLineCode,
            urgencyCode: dto.urgencyCode,
            leadSourceCode: dto.leadSourceCode ?? null,
            companyName: dto.companyName.trim(),
            industryCode: dto.industryCode,
            contactName: dto.contactName.trim(),
            contactPosition: dto.contactPosition ?? null,
            businessEmail: dto.businessEmail.trim().toLowerCase(),
            mobile: dto.mobile.trim(),
            existingClient: dto.existingClient,
            preferredContact: dto.preferredContact,
            siteCityCode: dto.siteCityCode,
            siteAccessCode: dto.siteAccessCode ?? null,
            craneCount: dto.craneCount ?? null,
            craneTypeCode: dto.craneTypeCode,
            oemCode: dto.oemCode,
            swlTonnes: dto.swlTonnes ?? null,
            yearOfManufacture: dto.yearOfManufacture ?? null,
            environmentCode: dto.environmentCode,
            spanLiftHeight: dto.spanLiftHeight ?? null,
            dutyClassCode: dto.dutyClassCode ?? null,
            scopeDetail,
            budgetBandCode: dto.budgetBandCode ?? null,
            completionTimelineCode: dto.completionTimelineCode ?? null,
            procurementCode: dto.procurementCode ?? null,
            paymentTermsCode: dto.paymentTermsCode ?? null,
            projectDescription: dto.projectDescription.trim(),
            constraintsConcerns: dto.constraintsConcerns ?? null,
            priority,
            status: 'NEW',
            manageToken: randomBytes(24).toString('hex'),
            triageDueAt: due(sla.triage),
            siteVisitDueAt: due(sla.siteVisit),
            proposalDueAt: due(sla.proposal),
            consentAt: now,
            privacyNoticeVersion: this.config.getOrThrow<string>(
              'PRIVACY_NOTICE_VERSION',
            ),
            marketingOptIn: dto.marketingOptIn ?? false,
            marketingOptInAt: dto.marketingOptIn ? now : null,
            sourcePage: dto.sourcePage ?? null,
            ipHash: this.spamCheck.hashIp(context.ip),
            userAgent: context.userAgent ?? null,
            spamScore: spam.score,
          }),
        );

        await this.linkMany(
          manager,
          saved.id,
          dto,
          stored.map((f) => f.id),
        );

        await manager.save(
          manager.create(CraneQuoteEvent, {
            quoteId: saved.id,
            eventType: 'CREATED',
            actor: null,
            note: `Quote requested — priority ${priority}`,
            metadata: {
              priority,
              spamScore: spam.score,
              spamReasons: spam.reasons,
              attachments: stored.length,
            },
          }),
        );

        // A production stop is recorded as an escalation on arrival, so the
        // trail shows the alarm was raised even before anyone opened it.
        if (priority === 'P1') {
          await manager.save(
            manager.create(CraneQuoteEvent, {
              quoteId: saved.id,
              eventType: 'ESCALATED',
              actor: null,
              note: 'P1 production stop — immediate response required',
            }),
          );
        }

        return saved;
      });

      await this.notify(quote, priority);

      this.logger.log(
        `Quote ${quote.referenceNo} (${priority}) from ${quote.companyName}`,
      );

      return {
        referenceNo: quote.referenceNo,
        manageToken: quote.manageToken,
        priority,
        triageDueAt: quote.triageDueAt,
        proposalDueAt: quote.proposalDueAt,
        message:
          priority === 'P1'
            ? `Reference ${quote.referenceNo} recorded. For a production stop, call ${HOTLINE} now — please do not wait for the callback.`
            : `Thank you. Your reference is ${quote.referenceNo}. A senior engineer will call you back within 24 hours.`,
        ...(priority === 'P1' ? { hotline: HOTLINE } : {}),
      };
    } catch (error) {
      for (const file of stored) {
        await this.files
          .remove(file.id)
          .catch((cleanupError: unknown) =>
            this.logger.error(
              `Orphaned attachment ${file.id}: ${String(cleanupError)}`,
            ),
          );
      }
      throw error;
    }
  }

  async findByToken(token: string): Promise<CustomerQuoteView> {
    const quote = await this.quoteRepo.findOne({
      where: { manageToken: token, isDeleted: false },
      relations: { serviceLine: true },
    });

    if (!quote) throw new NotFoundException('Quote request not found');

    return {
      referenceNo: quote.referenceNo,
      status: quote.status,
      priority: quote.priority,
      serviceLine: quote.serviceLine?.serviceLineName ?? null,
      submittedAt: quote.createdDate,
      proposalDueAt: quote.proposalDueAt,
    };
  }

  // =======================================================================
  // Admin
  // =======================================================================

  async list(
    query: ListCraneQuotesDto,
  ): Promise<PaginatedResult<CraneQuoteRequest>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.quoteRepo
      .createQueryBuilder('quote')
      .leftJoinAndSelect('quote.serviceLine', 'serviceLine')
      .leftJoinAndSelect('quote.urgency', 'urgency')
      .leftJoinAndSelect('quote.siteCity', 'siteCity')
      .leftJoinAndSelect('quote.craneType', 'craneType')
      .leftJoinAndSelect('quote.oem', 'oem')
      .leftJoinAndSelect('quote.industry', 'industry')
      .where('quote.isDeleted = false')
      .andWhere('quote.siteCode = :siteCode', { siteCode: SITE_CODE });

    if (query.search) {
      qb.andWhere(
        `(quote.companyName ILIKE :search
          OR quote.contactName ILIKE :search
          OR quote.businessEmail ILIKE :search
          OR quote.referenceNo ILIKE :search)`,
        { search: `%${query.search}%` },
      );
    }
    if (query.status)
      qb.andWhere('quote.status = :status', { status: query.status });
    if (query.priority)
      qb.andWhere('quote.priority = :priority', { priority: query.priority });
    if (query.serviceLineCode !== undefined) {
      qb.andWhere('quote.serviceLineCode = :sl', { sl: query.serviceLineCode });
    }
    if (query.siteCityCode !== undefined) {
      qb.andWhere('quote.siteCityCode = :city', { city: query.siteCityCode });
    }
    if (query.overdue) {
      qb.andWhere('quote.firstRespondedAt IS NULL')
        .andWhere('quote.triageDueAt < now()')
        .andWhere("quote.status = 'NEW'");
    }

    // Worst first, then oldest — the order a responder wants to work in.
    const [items, total] = await qb
      .orderBy('quote.priority', 'ASC')
      .addOrderBy('quote.createdDate', 'ASC')
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

  /** The full record, including the columns the list withholds. */
  async findById(id: string): Promise<CraneQuoteRequest> {
    const quote = await this.quoteRepo
      .createQueryBuilder('quote')
      .leftJoinAndSelect('quote.serviceLine', 'serviceLine')
      .leftJoinAndSelect('quote.additionalServices', 'additionalServices')
      .leftJoinAndSelect('quote.urgency', 'urgency')
      .leftJoinAndSelect('quote.leadSource', 'leadSource')
      .leftJoinAndSelect('quote.industry', 'industry')
      .leftJoinAndSelect('quote.siteCity', 'siteCity')
      .leftJoinAndSelect('quote.siteAccess', 'siteAccess')
      .leftJoinAndSelect('quote.craneType', 'craneType')
      .leftJoinAndSelect('quote.oem', 'oem')
      .leftJoinAndSelect('quote.environment', 'environment')
      .leftJoinAndSelect('quote.dutyClass', 'dutyClass')
      .leftJoinAndSelect('quote.budgetBand', 'budgetBand')
      .leftJoinAndSelect('quote.completionTimeline', 'completionTimeline')
      .leftJoinAndSelect('quote.procurement', 'procurement')
      .leftJoinAndSelect('quote.paymentTerms', 'paymentTerms')
      .leftJoinAndSelect('quote.requiredDocuments', 'requiredDocuments')
      .leftJoinAndSelect('quote.attachments', 'attachments')
      .addSelect([
        'quote.mobile',
        'quote.constraintsConcerns',
        'quote.budgetBandCode',
        'quote.paymentTermsCode',
      ])
      .where('quote.id = :id', { id })
      .andWhere('quote.isDeleted = false')
      .andWhere('quote.siteCode = :siteCode', { siteCode: SITE_CODE })
      .getOne();

    if (!quote) throw new NotFoundException('Quote request not found');
    return quote;
  }

  async setStatus(
    id: string,
    status: QuoteStatus,
    note: string | undefined,
    actor: string | null,
  ): Promise<CraneQuoteRequest> {
    const quote = await this.requireQuote(id);

    if (quote.status === 'WITHDRAWN') {
      throw new ForbiddenException(
        'This request was withdrawn by the customer and cannot be reopened',
      );
    }

    const previous = quote.status;
    if (previous === status) return this.findById(id);

    // The triage clock stops the first time someone actually engages.
    const stopsClock =
      !quote.firstRespondedAt && status !== 'NEW' && status !== 'WITHDRAWN';

    await this.quoteRepo.update(
      { id },
      { status, ...(stopsClock ? { firstRespondedAt: new Date() } : {}) },
    );

    await this.recordEvent(id, 'STATUS_CHANGED', actor, note ?? null, {
      from: previous,
      to: status,
    });

    return this.findById(id);
  }

  async assign(
    id: string,
    assignedTo: string,
    actor: string | null,
  ): Promise<CraneQuoteRequest> {
    await this.requireQuote(id);
    await this.quoteRepo.update({ id }, { assignedTo });
    await this.recordEvent(id, 'ASSIGNED', actor, `Assigned to ${assignedTo}`);
    return this.findById(id);
  }

  async addNote(
    id: string,
    note: string,
    actor: string | null,
  ): Promise<CraneQuoteEvent> {
    await this.requireQuote(id);
    return this.recordEvent(id, 'NOTE_ADDED', actor, note);
  }

  /** A signed URL for one attachment, and a record that it was issued. */
  async attachmentUrl(
    id: string,
    fileId: string,
    actor: string | null,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const quote = await this.findById(id);
    const attached = (quote.attachments ?? []).some((f) => f.id === fileId);

    if (!attached) {
      throw new NotFoundException('That file is not attached to this request');
    }

    // SITE_CODE, not the admin's: the controller carries @SiteScope, so a
    // caller who reaches here is already on the crane dashboard.
    const link = await this.files.downloadUrl(fileId, SITE_CODE);
    await this.recordEvent(
      id,
      'ATTACHMENT_VIEWED',
      actor,
      `Issued link for ${fileId}`,
    );
    return link;
  }

  listEvents(id: string): Promise<CraneQuoteEvent[]> {
    return this.eventRepo.find({
      where: { quoteId: id },
      order: { createdDate: 'ASC' },
    });
  }

  // =======================================================================
  // Internals
  // =======================================================================

  /**
   * Checks section 04 against the questionnaire for the chosen service line.
   *
   * This is what replaces the foreign keys a JSONB column cannot have: an
   * unknown key, an unknown value, or an answer belonging to a different
   * service line is a 400 rather than something that quietly lands in the
   * database and confuses whoever reads it later.
   */
  private validateScope(
    serviceLineCode: number,
    provided: Record<string, unknown> | undefined,
  ): Record<string, unknown> | null {
    const schema = SCOPE_SCHEMAS[serviceLineCode];
    if (!schema) {
      // Reachable only if a service line is seeded into the master table
      // without a questionnaire here. Silently returning null would drop the
      // customer's Section 04 answers on the floor, so this fails instead —
      // and it is a 500 because the misconfiguration is ours, not theirs.
      // assertScopeSchemasCoverServiceLines() logs it at boot so it should
      // never be a customer who finds out.
      this.logger.error(
        `Service line ${serviceLineCode} has no scope schema — refusing the ` +
          `submission rather than discarding Section 04.`,
      );
      throw new InternalServerErrorException(
        'This service line is not fully configured yet. Please call us on ' +
          `${HOTLINE} and we will take the details directly.`,
      );
    }

    const answers = provided ?? {};
    const problems: string[] = [];

    for (const key of Object.keys(answers)) {
      if (!(key in schema)) problems.push(`unexpected question "${key}"`);
    }

    for (const [key, question] of Object.entries(schema)) {
      const value = answers[key];
      const missing = value === undefined || value === null || value === '';

      if (missing) {
        if (question.required) problems.push(`"${key}" is required`);
        continue;
      }
      if (question.values === 'TEXT') {
        if (typeof value !== 'string' || value.length > 2000) {
          problems.push(`"${key}" must be text under 2000 characters`);
        }
        continue;
      }
      // Only a string can be one of the listed choices — an object or array
      // here is a malformed answer, not something to coerce and compare.
      if (typeof value !== 'string' || !question.values.includes(value)) {
        problems.push(`"${key}" must be one of: ${question.values.join(', ')}`);
      }
    }

    if (problems.length > 0) {
      throw new BadRequestException(`Scope detail: ${problems.join('; ')}`);
    }

    return Object.keys(answers).length > 0 ? answers : null;
  }

  /** Validates every coded field in one pass, so a bad form reports all of it. */
  private async assertCodesExist(dto: CreateCraneQuoteDto): Promise<void> {
    const live = { isActive: true, isDeleted: false };
    const checks: [string, Promise<unknown>][] = [
      [
        `serviceLineCode ${dto.serviceLineCode}`,
        this.serviceLineRepo.findOne({
          where: { serviceLineCode: dto.serviceLineCode, ...live },
        }),
      ],
      [
        `urgencyCode ${dto.urgencyCode}`,
        this.urgencyRepo.findOne({
          where: { urgencyCode: dto.urgencyCode, ...live },
        }),
      ],
      [
        `siteCityCode ${dto.siteCityCode}`,
        this.siteCityRepo.findOne({
          where: { siteCityCode: dto.siteCityCode, ...live },
        }),
      ],
      [
        `craneTypeCode ${dto.craneTypeCode}`,
        this.craneTypeRepo.findOne({
          where: { craneTypeCode: dto.craneTypeCode, ...live },
        }),
      ],
      [
        `oemCode ${dto.oemCode}`,
        this.oemRepo.findOne({ where: { oemCode: dto.oemCode, ...live } }),
      ],
      [
        `environmentCode ${dto.environmentCode}`,
        this.environmentRepo.findOne({
          where: { environmentCode: dto.environmentCode, ...live },
        }),
      ],
      // Industries are shared across brands, so this one must also be on 102 —
      // an IT industry code would otherwise pass a plain existence check.
      [
        `industryCode ${dto.industryCode}`,
        this.industryRepo.findOne({
          where: {
            industryCode: dto.industryCode,
            siteCode: SITE_CODE,
            ...live,
          },
        }),
      ],
    ];

    if (dto.siteAccessCode !== undefined) {
      checks.push([
        `siteAccessCode ${dto.siteAccessCode}`,
        this.siteAccessRepo.findOne({
          where: { siteAccessCode: dto.siteAccessCode, ...live },
        }),
      ]);
    }
    if (dto.leadSourceCode !== undefined) {
      checks.push([
        `leadSourceCode ${dto.leadSourceCode}`,
        this.leadSourceRepo.findOne({
          where: { leadSourceCode: dto.leadSourceCode, ...live },
        }),
      ]);
    }
    if (dto.dutyClassCode !== undefined) {
      checks.push([
        `dutyClassCode ${dto.dutyClassCode}`,
        this.dutyClassRepo.findOne({
          where: { dutyClassCode: dto.dutyClassCode, ...live },
        }),
      ]);
    }
    if (dto.budgetBandCode !== undefined) {
      checks.push([
        `budgetBandCode ${dto.budgetBandCode}`,
        this.budgetRepo.findOne({
          where: { budgetBandCode: dto.budgetBandCode, ...live },
        }),
      ]);
    }
    if (dto.completionTimelineCode !== undefined) {
      checks.push([
        `completionTimelineCode ${dto.completionTimelineCode}`,
        this.timelineRepo.findOne({
          where: {
            completionTimelineCode: dto.completionTimelineCode,
            ...live,
          },
        }),
      ]);
    }
    if (dto.procurementCode !== undefined) {
      checks.push([
        `procurementCode ${dto.procurementCode}`,
        this.procurementRepo.findOne({
          where: { procurementCode: dto.procurementCode, ...live },
        }),
      ]);
    }
    if (dto.paymentTermsCode !== undefined) {
      checks.push([
        `paymentTermsCode ${dto.paymentTermsCode}`,
        this.paymentRepo.findOne({
          where: { paymentTermsCode: dto.paymentTermsCode, ...live },
        }),
      ]);
    }

    const results = await Promise.all(checks.map(([, p]) => p));
    const unknown = checks
      .filter((_, i) => !results[i])
      .map(([label]) => label);

    if (dto.additionalServiceCodes?.length) {
      const found = await this.serviceLineRepo.find({
        where: { serviceLineCode: In(dto.additionalServiceCodes), ...live },
      });
      const known = new Set(found.map((r) => r.serviceLineCode));
      unknown.push(
        ...dto.additionalServiceCodes
          .filter((c) => !known.has(c))
          .map((c) => `additionalServiceCode ${c}`),
      );
    }

    if (dto.requiredDocumentCodes?.length) {
      const found = await this.proposalDocRepo.find({
        where: { proposalDocCode: In(dto.requiredDocumentCodes), ...live },
      });
      const known = new Set(found.map((r) => r.proposalDocCode));
      unknown.push(
        ...dto.requiredDocumentCodes
          .filter((c) => !known.has(c))
          .map((c) => `requiredDocumentCode ${c}`),
      );
    }

    if (unknown.length > 0) {
      throw new NotFoundException(`Unknown or inactive: ${unknown.join(', ')}`);
    }
  }

  private async linkMany(
    manager: { query: (sql: string, params: unknown[]) => Promise<unknown> },
    quoteId: string,
    dto: CreateCraneQuoteDto,
    fileIds: string[],
  ): Promise<void> {
    if (dto.additionalServiceCodes?.length) {
      await manager.query(
        `INSERT INTO crane_quote_additional_services (quote_id, service_line_code)
         SELECT $1, unnest($2::int[])`,
        [quoteId, dto.additionalServiceCodes],
      );
    }
    if (dto.requiredDocumentCodes?.length) {
      await manager.query(
        `INSERT INTO crane_quote_required_documents (quote_id, proposal_doc_code)
         SELECT $1, unnest($2::int[])`,
        [quoteId, dto.requiredDocumentCodes],
      );
    }
    if (fileIds.length) {
      await manager.query(
        `INSERT INTO crane_quote_attachments (quote_id, file_id)
         SELECT $1, unnest($2::uuid[])`,
        [quoteId, fileIds],
      );
    }
  }

  private async requireQuote(id: string): Promise<CraneQuoteRequest> {
    const quote = await this.quoteRepo.findOne({
      where: { id, isDeleted: false, siteCode: SITE_CODE },
    });
    if (!quote) throw new NotFoundException('Quote request not found');
    return quote;
  }

  private recordEvent(
    quoteId: string,
    eventType: QuoteEventType,
    actor: string | null,
    note: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<CraneQuoteEvent> {
    return this.eventRepo.save(
      this.eventRepo.create({
        quoteId,
        eventType,
        actor,
        note,
        metadata: metadata ?? null,
      }),
    );
  }

  private async notify(
    quote: CraneQuoteRequest,
    priority: QuotePriority,
  ): Promise<void> {
    // For a production stop this really wants to be SMS or WhatsApp, not
    // email — the mail module does not deliver yet, so today the warning log
    // is the alert. Worth wiring properly before this goes live.
    if (priority === 'P1') {
      this.logger.warn(
        `P1 PRODUCTION STOP — ${quote.referenceNo} from ${quote.companyName}. Notify ${QUOTES_INBOX} / ${HOTLINE} immediately.`,
      );
    }

    await this.mail.send({
      to: QUOTES_INBOX,
      subject: `[${priority}] Quote request ${quote.referenceNo} — ${quote.companyName}`,
      body: [
        `${quote.contactName} at ${quote.companyName} has requested a quote.`,
        ``,
        `Reference: ${quote.referenceNo}`,
        `Priority:  ${priority}`,
        `Triage by: ${quote.triageDueAt.toISOString()}`,
        `Proposal:  ${quote.proposalDueAt.toISOString()}`,
      ].join('\n'),
    });

    await this.mail.send({
      to: quote.businessEmail,
      subject: `We have your quote request — ${quote.referenceNo}`,
      body: [
        `Hello ${quote.contactName},`,
        ``,
        `Thank you. Your reference is ${quote.referenceNo}.`,
        priority === 'P1'
          ? `Your submission is marked as a production stop. Please call ${HOTLINE} now rather than waiting for the callback.`
          : `A senior engineer will call you back within 24 hours.`,
        ``,
        `Track this request: /crane/quotes/${quote.manageToken}`,
      ].join('\n'),
    });

    await this.recordEvent(
      quote.id,
      'NOTIFICATION_SENT',
      null,
      'Acknowledgement sent to customer and quotes inbox',
    );
  }
}
