import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/pagination-query.dto';
import { ReferenceNumberService } from '../../common/services/reference-number.service';
import { SpamCheckService } from '../../common/services/spam-check.service';
import { addBusinessDays } from '../../common/utils/business-hours.util';
import type { WorkingCalendar } from '../../common/utils/business-hours.util';
import { MailService } from '../../mail/mail.service';
import { IndustryMaster } from '../../master-data/entities/industry-master.entity';
import { CraneAccessApprovalMaster } from '../masters/entities/crane-access-approval-master.entity';
import { CraneAgeBandMaster } from '../masters/entities/crane-age-band-master.entity';
import { CraneEngagementTypeMaster } from '../masters/entities/crane-engagement-type-master.entity';
import { CraneEngineerVisaMaster } from '../masters/entities/crane-engineer-visa-master.entity';
import { CraneEnvironmentMaster } from '../masters/entities/crane-environment-master.entity';
import { CraneHotWorkMaster } from '../masters/entities/crane-hot-work-master.entity';
import { CraneLeadSourceMaster } from '../masters/entities/crane-lead-source-master.entity';
import { CraneOemMaster } from '../masters/entities/crane-oem-master.entity';
import { CranePpeProviderMaster } from '../masters/entities/crane-ppe-provider-master.entity';
import { CraneServiceLineMaster } from '../masters/entities/crane-service-line-master.entity';
import { CraneSiteAccessMaster } from '../masters/entities/crane-site-access-master.entity';
import { CraneSiteCityMaster } from '../masters/entities/crane-site-city-master.entity';
import { CraneTranslatorMaster } from '../masters/entities/crane-translator-master.entity';
import { CraneTypeMaster } from '../masters/entities/crane-type-master.entity';
import { CraneVisitDurationMaster } from '../masters/entities/crane-visit-duration-master.entity';
import { CraneVisitPurposeMaster } from '../masters/entities/crane-visit-purpose-master.entity';
import { CraneVisitTimeMaster } from '../masters/entities/crane-visit-time-master.entity';
import { CraneVisitUrgencyMaster } from '../masters/entities/crane-visit-urgency-master.entity';
import { CraneQuoteRequest } from '../quote/entities/crane-quote-request.entity';
import { CreateCraneSiteVisitDto } from './dto/create-crane-site-visit.dto';
import { ListCraneSiteVisitsDto } from './dto/manage-crane-site-visit.dto';
import { CraneSiteVisitEvent } from './entities/crane-site-visit-event.entity';
import type { VisitEventType } from './entities/crane-site-visit-event.entity';
import { CraneSiteVisit } from './entities/crane-site-visit.entity';
import type { VisitStatus } from './entities/crane-site-visit.entity';
import { FEATURE } from '../../auth/permissions.constants';
import { NotificationService } from '../../notifications/notification.service';

/** Veltrixair Industries. Every row this feature writes belongs to it. */
const SITE_CODE = 102;

const REFERENCE_PREFIX = 'VTX-VST';
const REFERENCE_SEQUENCE = 'crane_site_visit_ref_seq';

/** KSA working week: Sunday to Thursday. */
const KSA_CALENDAR: WorkingCalendar = {
  timezone: 'Asia/Riyadh',
  workingDays: [0, 1, 2, 3, 4],
  workStartHour: 8,
  workEndHour: 17,
};

/** The two promises printed beside the form. */
const COORDINATION_HOURS = 48;
const REPORT_WORKING_DAYS = 5;

export interface VisitOption {
  code: number;
  label: string;
}

export interface VisitFormOptions {
  visitPurposes: VisitOption[];
  serviceLines: VisitOption[];
  visitUrgencies: VisitOption[];
  industries: VisitOption[];
  leadSources: VisitOption[];
  siteCities: VisitOption[];
  siteAccessRegimes: VisitOption[];
  craneTypes: VisitOption[];
  oems: VisitOption[];
  ageBands: VisitOption[];
  environments: VisitOption[];
  visitDurations: VisitOption[];
  visitTimes: VisitOption[];
  accessApprovals: VisitOption[];
  engineerVisas: VisitOption[];
  ppeProviders: VisitOption[];
  hotWorkOptions: VisitOption[];
  translators: VisitOption[];
  engagementTypes: VisitOption[];
}

export interface VisitResult {
  referenceNo: string;
  manageToken: string;
  coordinationDueAt: Date;
  reportDueAt: Date;
  message: string;
}

export interface CustomerVisitView {
  referenceNo: string;
  status: VisitStatus;
  visitPurpose: string | null;
  scheduledAt: Date | null;
  requestedAt: Date;
  reportDueAt: Date;
}

@Injectable()
export class CraneSiteVisitService {
  private readonly logger = new Logger(CraneSiteVisitService.name);

  constructor(
    @InjectRepository(CraneSiteVisit)
    private readonly visitRepo: Repository<CraneSiteVisit>,
    @InjectRepository(CraneSiteVisitEvent)
    private readonly eventRepo: Repository<CraneSiteVisitEvent>,
    @InjectRepository(CraneQuoteRequest)
    private readonly quoteRepo: Repository<CraneQuoteRequest>,
    @InjectRepository(CraneVisitPurposeMaster)
    private readonly purposeRepo: Repository<CraneVisitPurposeMaster>,
    @InjectRepository(CraneVisitUrgencyMaster)
    private readonly urgencyRepo: Repository<CraneVisitUrgencyMaster>,
    @InjectRepository(CraneServiceLineMaster)
    private readonly serviceLineRepo: Repository<CraneServiceLineMaster>,
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
    @InjectRepository(CraneAgeBandMaster)
    private readonly ageBandRepo: Repository<CraneAgeBandMaster>,
    @InjectRepository(CraneEnvironmentMaster)
    private readonly environmentRepo: Repository<CraneEnvironmentMaster>,
    @InjectRepository(CraneVisitDurationMaster)
    private readonly durationRepo: Repository<CraneVisitDurationMaster>,
    @InjectRepository(CraneVisitTimeMaster)
    private readonly timeRepo: Repository<CraneVisitTimeMaster>,
    @InjectRepository(CraneAccessApprovalMaster)
    private readonly accessApprovalRepo: Repository<CraneAccessApprovalMaster>,
    @InjectRepository(CraneEngineerVisaMaster)
    private readonly visaRepo: Repository<CraneEngineerVisaMaster>,
    @InjectRepository(CranePpeProviderMaster)
    private readonly ppeRepo: Repository<CranePpeProviderMaster>,
    @InjectRepository(CraneHotWorkMaster)
    private readonly hotWorkRepo: Repository<CraneHotWorkMaster>,
    @InjectRepository(CraneTranslatorMaster)
    private readonly translatorRepo: Repository<CraneTranslatorMaster>,
    @InjectRepository(CraneEngagementTypeMaster)
    private readonly engagementRepo: Repository<CraneEngagementTypeMaster>,
    @InjectRepository(IndustryMaster)
    private readonly industryRepo: Repository<IndustryMaster>,
    private readonly dataSource: DataSource,
    private readonly referenceNumbers: ReferenceNumberService,
    private readonly spamCheck: SpamCheckService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  // =======================================================================
  // Public
  // =======================================================================

  async formOptions(): Promise<VisitFormOptions> {
    const live = {
      where: { isActive: true, isDeleted: false },
      order: { displayOrder: 'ASC' as const },
    };

    const [
      purposes,
      serviceLines,
      urgencies,
      leadSources,
      siteCities,
      siteAccess,
      craneTypes,
      oems,
      ageBands,
      environments,
      durations,
      times,
      accessApprovals,
      visas,
      ppe,
      hotWork,
      translators,
      engagements,
      industries,
    ] = await Promise.all([
      this.purposeRepo.find(live),
      this.serviceLineRepo.find(live),
      this.urgencyRepo.find(live),
      this.leadSourceRepo.find(live),
      this.siteCityRepo.find(live),
      this.siteAccessRepo.find(live),
      this.craneTypeRepo.find(live),
      this.oemRepo.find(live),
      this.ageBandRepo.find(live),
      this.environmentRepo.find(live),
      this.durationRepo.find(live),
      this.timeRepo.find(live),
      this.accessApprovalRepo.find(live),
      this.visaRepo.find(live),
      this.ppeRepo.find(live),
      this.hotWorkRepo.find(live),
      this.translatorRepo.find(live),
      this.engagementRepo.find(live),
      // Shared table with a per-brand range, so this one filters by site.
      this.industryRepo.find({
        where: { isActive: true, isDeleted: false, siteCode: SITE_CODE },
        order: { displayOrder: 'ASC' },
      }),
    ]);

    return {
      visitPurposes: purposes.map((r) => ({
        code: r.visitPurposeCode,
        label: r.visitPurposeName,
      })),
      serviceLines: serviceLines.map((r) => ({
        code: r.serviceLineCode,
        label: r.serviceLineName,
      })),
      visitUrgencies: urgencies.map((r) => ({
        code: r.visitUrgencyCode,
        label: r.visitUrgencyName,
      })),
      industries: industries.map((r) => ({
        code: r.industryCode,
        label: r.industryName,
      })),
      leadSources: leadSources.map((r) => ({
        code: r.leadSourceCode,
        label: r.leadSourceName,
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
      ageBands: ageBands.map((r) => ({
        code: r.ageBandCode,
        label: r.ageBandName,
      })),
      environments: environments.map((r) => ({
        code: r.environmentCode,
        label: r.environmentName,
      })),
      visitDurations: durations.map((r) => ({
        code: r.visitDurationCode,
        label: r.visitDurationName,
      })),
      visitTimes: times.map((r) => ({
        code: r.visitTimeCode,
        label: r.visitTimeName,
      })),
      accessApprovals: accessApprovals.map((r) => ({
        code: r.accessApprovalCode,
        label: r.accessApprovalName,
      })),
      engineerVisas: visas.map((r) => ({
        code: r.engineerVisaCode,
        label: r.engineerVisaName,
      })),
      ppeProviders: ppe.map((r) => ({
        code: r.ppeProviderCode,
        label: r.ppeProviderName,
      })),
      hotWorkOptions: hotWork.map((r) => ({
        code: r.hotWorkCode,
        label: r.hotWorkName,
      })),
      translators: translators.map((r) => ({
        code: r.translatorCode,
        label: r.translatorName,
      })),
      engagementTypes: engagements.map((r) => ({
        code: r.engagementTypeCode,
        label: r.engagementTypeName,
      })),
    };
  }

  async submit(
    dto: CreateCraneSiteVisitDto,
    context: { ip?: string; userAgent?: string },
  ): Promise<VisitResult> {
    await this.assertCodesExist(dto);

    if (dto.quoteId) {
      const quote = await this.quoteRepo.findOne({
        where: { id: dto.quoteId, siteCode: SITE_CODE, isDeleted: false },
        select: ['id'],
      });
      if (!quote) throw new NotFoundException('No such quote request');
    }

    const spam = await this.spamCheck.evaluate({
      email: dto.businessEmail,
      honeypot: dto.website,
      captchaToken: dto.captchaToken,
      ip: context.ip,
    });

    const now = new Date();
    // The coordination call is promised in clock hours, not working days —
    // "within 48 hours" on the page means exactly that.
    const coordinationDueAt = new Date(
      now.getTime() + COORDINATION_HOURS * 60 * 60 * 1000,
    );
    const reportDueAt = addBusinessDays(now, REPORT_WORKING_DAYS, KSA_CALENDAR);

    const visit = await this.dataSource.transaction(async (manager) => {
      // Four digits, matching VTX-VST-2026-XXXX on the page.
      const referenceNo = await this.referenceNumbers.next(
        REFERENCE_PREFIX,
        REFERENCE_SEQUENCE,
        manager,
        4,
      );

      const saved = await manager.save(
        manager.create(CraneSiteVisit, {
          referenceNo,
          siteCode: SITE_CODE,
          quoteId: dto.quoteId ?? null,
          visitPurposeCode: dto.visitPurposeCode,
          serviceLineCode: dto.serviceLineCode ?? null,
          visitUrgencyCode: dto.visitUrgencyCode,
          engineerFocus: dto.engineerFocus.trim(),
          companyName: dto.companyName.trim(),
          industryCode: dto.industryCode,
          contactName: dto.contactName.trim(),
          contactPosition: dto.contactPosition ?? null,
          businessEmail: dto.businessEmail.trim().toLowerCase(),
          mobile: dto.mobile.trim(),
          existingClient: dto.existingClient,
          leadSourceCode: dto.leadSourceCode ?? null,
          siteCityCode: dto.siteCityCode,
          siteAccessCode: dto.siteAccessCode ?? null,
          siteAddress: dto.siteAddress ?? null,
          siteContactName: dto.siteContactName ?? null,
          siteContactPhone: dto.siteContactPhone ?? null,
          craneCount: dto.craneCount ?? null,
          craneTypeCode: dto.craneTypeCode ?? null,
          oemCode: dto.oemCode ?? null,
          ageBandCode: dto.ageBandCode ?? null,
          environmentCode: dto.environmentCode ?? null,
          preferredDates: dto.preferredDates ?? null,
          avoidDates: dto.avoidDates ?? null,
          visitDurationCode: dto.visitDurationCode ?? null,
          visitTimeCode: dto.visitTimeCode ?? null,
          attendees: dto.attendees ?? null,
          agendaItems: dto.agendaItems ?? null,
          accessApprovalCode: dto.accessApprovalCode ?? null,
          engineerVisaCode: dto.engineerVisaCode ?? null,
          ppeProviderCode: dto.ppeProviderCode ?? null,
          hotWorkCode: dto.hotWorkCode ?? null,
          translatorCode: dto.translatorCode ?? null,
          engagementTypeCode: dto.engagementTypeCode ?? null,
          siteConstraints: dto.siteConstraints ?? null,
          status: 'NEW',
          manageToken: randomBytes(24).toString('hex'),
          coordinationDueAt,
          reportDueAt,
          consentAt: now,
          privacyNoticeVersion: this.config.getOrThrow<string>(
            'PRIVACY_NOTICE_VERSION',
          ),
          photographyConsent: dto.photographyConsent ?? false,
          marketingOptIn: dto.marketingOptIn ?? false,
          sourcePage: dto.sourcePage ?? null,
          ipHash: this.spamCheck.hashIp(context.ip),
          userAgent: context.userAgent ?? null,
          spamScore: spam.score,
        }),
      );

      await manager.save(
        manager.create(CraneSiteVisitEvent, {
          visitId: saved.id,
          eventType: 'CREATED',
          actor: null,
          note: 'Site visit requested',
          metadata: {
            spamScore: spam.score,
            spamReasons: spam.reasons,
            fromQuote: dto.quoteId ?? null,
          },
        }),
      );

      return saved;
    });

    await this.notify(visit);

    this.logger.log(
      `Site visit ${visit.referenceNo} requested by ${visit.companyName}`,
    );

    /*
     * The city is the useful half — a visit request is answered by working out
     * who is near enough to go. It has to be looked up rather than read off
     * the record: `siteCity` is a relation, and a freshly saved row carries
     * only the code, so reading it directly printed "undefined" into the feed.
     */
    const city = await this.siteCityRepo.findOne({
      where: { siteCityCode: visit.siteCityCode },
      select: { siteCityName: true },
    });

    await this.notifications.raise({
      siteCode: SITE_CODE,
      featureCode: FEATURE.CRANE_SITE_VISITS,
      category: 'visits',
      lead: 'Site visit requested',
      body:
        `${visit.companyName} · ${visit.contactName}` +
        (city ? ` · ${city.siteCityName}` : ''),
      link: `/crane/site-visits/${visit.id}`,
      sourceType: 'crane_site_visit',
      sourceId: visit.id,
    });

    return {
      referenceNo: visit.referenceNo,
      manageToken: visit.manageToken,
      coordinationDueAt: visit.coordinationDueAt,
      reportDueAt: visit.reportDueAt,
      message: `Thank you. Your reference is ${visit.referenceNo}. An engineer will call you within 48 hours to agree a date.`,
    };
  }

  async findByToken(token: string): Promise<CustomerVisitView> {
    const visit = await this.visitRepo.findOne({
      where: { manageToken: token, isDeleted: false },
      relations: { visitPurpose: true },
    });

    if (!visit) throw new NotFoundException('Site visit request not found');

    return {
      referenceNo: visit.referenceNo,
      status: visit.status,
      visitPurpose: visit.visitPurpose?.visitPurposeName ?? null,
      scheduledAt: visit.scheduledAt,
      requestedAt: visit.createdDate,
      reportDueAt: visit.reportDueAt,
    };
  }

  // =======================================================================
  // Admin
  // =======================================================================

  async list(
    query: ListCraneSiteVisitsDto,
  ): Promise<PaginatedResult<CraneSiteVisit>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.visitRepo
      .createQueryBuilder('visit')
      .leftJoinAndSelect('visit.visitPurpose', 'visitPurpose')
      .leftJoinAndSelect('visit.visitUrgency', 'visitUrgency')
      .leftJoinAndSelect('visit.siteCity', 'siteCity')
      .leftJoinAndSelect('visit.industry', 'industry')
      .leftJoinAndSelect('visit.engagementType', 'engagementType')
      .where('visit.isDeleted = false')
      .andWhere('visit.siteCode = :siteCode', { siteCode: SITE_CODE });

    if (query.search) {
      qb.andWhere(
        `(visit.companyName ILIKE :search
          OR visit.contactName ILIKE :search
          OR visit.businessEmail ILIKE :search
          OR visit.referenceNo ILIKE :search)`,
        { search: `%${query.search}%` },
      );
    }
    if (query.status)
      qb.andWhere('visit.status = :status', { status: query.status });
    if (query.visitPurposeCode !== undefined) {
      qb.andWhere('visit.visitPurposeCode = :purpose', {
        purpose: query.visitPurposeCode,
      });
    }
    if (query.visitUrgencyCode !== undefined) {
      qb.andWhere('visit.visitUrgencyCode = :urgency', {
        urgency: query.visitUrgencyCode,
      });
    }
    if (query.siteCityCode !== undefined) {
      qb.andWhere('visit.siteCityCode = :city', { city: query.siteCityCode });
    }
    if (query.engagementTypeCode !== undefined) {
      qb.andWhere('visit.engagementTypeCode = :engagement', {
        engagement: query.engagementTypeCode,
      });
    }
    if (query.overdue) {
      qb.andWhere('visit.firstRespondedAt IS NULL')
        .andWhere('visit.coordinationDueAt < now()')
        .andWhere("visit.status = 'NEW'");
    }

    // Soonest wanted first, then oldest — the order a coordinator works in.
    const [items, total] = await qb
      .orderBy('visit.visitUrgencyCode', 'ASC')
      .addOrderBy('visit.createdDate', 'ASC')
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

  async findById(id: string): Promise<CraneSiteVisit> {
    const visit = await this.visitRepo
      .createQueryBuilder('visit')
      .leftJoinAndSelect('visit.visitPurpose', 'visitPurpose')
      .leftJoinAndSelect('visit.serviceLine', 'serviceLine')
      .leftJoinAndSelect('visit.visitUrgency', 'visitUrgency')
      .leftJoinAndSelect('visit.industry', 'industry')
      .leftJoinAndSelect('visit.leadSource', 'leadSource')
      .leftJoinAndSelect('visit.siteCity', 'siteCity')
      .leftJoinAndSelect('visit.siteAccess', 'siteAccess')
      .leftJoinAndSelect('visit.craneType', 'craneType')
      .leftJoinAndSelect('visit.oem', 'oem')
      .leftJoinAndSelect('visit.ageBand', 'ageBand')
      .leftJoinAndSelect('visit.environment', 'environment')
      .leftJoinAndSelect('visit.visitDuration', 'visitDuration')
      .leftJoinAndSelect('visit.visitTime', 'visitTime')
      .leftJoinAndSelect('visit.accessApproval', 'accessApproval')
      .leftJoinAndSelect('visit.engineerVisa', 'engineerVisa')
      .leftJoinAndSelect('visit.ppeProvider', 'ppeProvider')
      .leftJoinAndSelect('visit.hotWork', 'hotWork')
      .leftJoinAndSelect('visit.translator', 'translator')
      .leftJoinAndSelect('visit.engagementType', 'engagementType')
      .leftJoinAndSelect('visit.quote', 'quote')
      .addSelect([
        'visit.mobile',
        'visit.siteAddress',
        'visit.siteContactPhone',
      ])
      .where('visit.id = :id', { id })
      .andWhere('visit.isDeleted = false')
      .andWhere('visit.siteCode = :siteCode', { siteCode: SITE_CODE })
      .getOne();

    if (!visit) throw new NotFoundException('Site visit request not found');
    return visit;
  }

  async setStatus(
    id: string,
    status: VisitStatus,
    note: string | undefined,
    actor: string | null,
  ): Promise<CraneSiteVisit> {
    const visit = await this.requireVisit(id);

    if (visit.status === 'CANCELLED') {
      throw new ForbiddenException(
        'This request was cancelled and cannot be reopened',
      );
    }

    /*
     * SCHEDULED is not a status you set. It is what having a date means.
     *
     * Allowing it here writes the status and leaves `scheduled_at` null, and
     * that null is not an internal detail: the customer's tracking page reads
     * { status, scheduledAt } straight from this row, so they are told their
     * visit is scheduled and shown no date. They then email to ask when —
     * which is the exact question that page exists to answer.
     *
     * Refused at the service rather than in the DTO so it holds for every
     * client, not just the admin panel.
     */
    if (status === 'SCHEDULED') {
      throw new BadRequestException(
        'Confirm the visit date instead — PATCH /admin/crane-site-visits/:id/' +
          'schedule sets the date and the status together.',
      );
    }

    const previous = visit.status;
    if (previous === status) return this.findById(id);

    const stopsClock =
      !visit.firstRespondedAt && status !== 'NEW' && status !== 'CANCELLED';

    await this.visitRepo.update(
      { id },
      { status, ...(stopsClock ? { firstRespondedAt: new Date() } : {}) },
    );
    await this.recordEvent(id, 'STATUS_CHANGED', actor, note ?? null, {
      from: previous,
      to: status,
    });

    return this.findById(id);
  }

  /**
   * Confirm the date, and move the request to SCHEDULED in the same call.
   *
   * A confirmed date that leaves the status behind is how a coordinator ends
   * up chasing something already in the diary.
   */
  async schedule(
    id: string,
    scheduledAt: string,
    assignedEngineer: string | undefined,
    note: string | undefined,
    actor: string | null,
  ): Promise<CraneSiteVisit> {
    const visit = await this.requireVisit(id);

    if (visit.status === 'CANCELLED') {
      throw new ForbiddenException('This request was cancelled');
    }

    const when = new Date(scheduledAt);

    await this.visitRepo.update(
      { id },
      {
        scheduledAt: when,
        status: 'SCHEDULED',
        ...(assignedEngineer ? { assignedEngineer } : {}),
        ...(visit.firstRespondedAt ? {} : { firstRespondedAt: new Date() }),
      },
    );

    await this.recordEvent(
      id,
      'SCHEDULED',
      actor,
      note ?? `Visit confirmed for ${when.toISOString()}`,
      {
        scheduledAt: when.toISOString(),
        assignedEngineer: assignedEngineer ?? null,
      },
    );

    return this.findById(id);
  }

  async assign(
    id: string,
    assignedEngineer: string,
    actor: string | null,
  ): Promise<CraneSiteVisit> {
    await this.requireVisit(id);
    await this.visitRepo.update({ id }, { assignedEngineer });
    await this.recordEvent(
      id,
      'ASSIGNED',
      actor,
      `Assigned to ${assignedEngineer}`,
    );
    return this.findById(id);
  }

  async addNote(
    id: string,
    note: string,
    actor: string | null,
  ): Promise<CraneSiteVisitEvent> {
    await this.requireVisit(id);
    return this.recordEvent(id, 'NOTE_ADDED', actor, note);
  }

  listEvents(id: string): Promise<CraneSiteVisitEvent[]> {
    return this.eventRepo.find({
      where: { visitId: id },
      order: { createdDate: 'ASC' },
    });
  }

  // =======================================================================
  // Internals
  // =======================================================================

  private async requireVisit(id: string): Promise<CraneSiteVisit> {
    const visit = await this.visitRepo.findOne({
      where: { id, isDeleted: false, siteCode: SITE_CODE },
    });
    if (!visit) throw new NotFoundException('Site visit request not found');
    return visit;
  }

  /** Validates every coded field at once, so a bad form reports all of it. */
  private async assertCodesExist(dto: CreateCraneSiteVisitDto): Promise<void> {
    const live = { isActive: true, isDeleted: false };
    const checks: [string, Promise<unknown>][] = [
      [
        `visitPurposeCode ${dto.visitPurposeCode}`,
        this.purposeRepo.findOne({
          where: { visitPurposeCode: dto.visitPurposeCode, ...live },
        }),
      ],
      [
        `visitUrgencyCode ${dto.visitUrgencyCode}`,
        this.urgencyRepo.findOne({
          where: { visitUrgencyCode: dto.visitUrgencyCode, ...live },
        }),
      ],
      [
        `siteCityCode ${dto.siteCityCode}`,
        this.siteCityRepo.findOne({
          where: { siteCityCode: dto.siteCityCode, ...live },
        }),
      ],
      // Industries are shared across brands, so this must also be on 102 —
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

    const optional: [number | undefined, string, Promise<unknown> | null][] = [
      [
        dto.serviceLineCode,
        'serviceLineCode',
        dto.serviceLineCode !== undefined
          ? this.serviceLineRepo.findOne({
              where: { serviceLineCode: dto.serviceLineCode, ...live },
            })
          : null,
      ],
      [
        dto.leadSourceCode,
        'leadSourceCode',
        dto.leadSourceCode !== undefined
          ? this.leadSourceRepo.findOne({
              where: { leadSourceCode: dto.leadSourceCode, ...live },
            })
          : null,
      ],
      [
        dto.siteAccessCode,
        'siteAccessCode',
        dto.siteAccessCode !== undefined
          ? this.siteAccessRepo.findOne({
              where: { siteAccessCode: dto.siteAccessCode, ...live },
            })
          : null,
      ],
      [
        dto.craneTypeCode,
        'craneTypeCode',
        dto.craneTypeCode !== undefined
          ? this.craneTypeRepo.findOne({
              where: { craneTypeCode: dto.craneTypeCode, ...live },
            })
          : null,
      ],
      [
        dto.oemCode,
        'oemCode',
        dto.oemCode !== undefined
          ? this.oemRepo.findOne({ where: { oemCode: dto.oemCode, ...live } })
          : null,
      ],
      [
        dto.ageBandCode,
        'ageBandCode',
        dto.ageBandCode !== undefined
          ? this.ageBandRepo.findOne({
              where: { ageBandCode: dto.ageBandCode, ...live },
            })
          : null,
      ],
      [
        dto.environmentCode,
        'environmentCode',
        dto.environmentCode !== undefined
          ? this.environmentRepo.findOne({
              where: { environmentCode: dto.environmentCode, ...live },
            })
          : null,
      ],
      [
        dto.visitDurationCode,
        'visitDurationCode',
        dto.visitDurationCode !== undefined
          ? this.durationRepo.findOne({
              where: { visitDurationCode: dto.visitDurationCode, ...live },
            })
          : null,
      ],
      [
        dto.visitTimeCode,
        'visitTimeCode',
        dto.visitTimeCode !== undefined
          ? this.timeRepo.findOne({
              where: { visitTimeCode: dto.visitTimeCode, ...live },
            })
          : null,
      ],
      [
        dto.accessApprovalCode,
        'accessApprovalCode',
        dto.accessApprovalCode !== undefined
          ? this.accessApprovalRepo.findOne({
              where: { accessApprovalCode: dto.accessApprovalCode, ...live },
            })
          : null,
      ],
      [
        dto.engineerVisaCode,
        'engineerVisaCode',
        dto.engineerVisaCode !== undefined
          ? this.visaRepo.findOne({
              where: { engineerVisaCode: dto.engineerVisaCode, ...live },
            })
          : null,
      ],
      [
        dto.ppeProviderCode,
        'ppeProviderCode',
        dto.ppeProviderCode !== undefined
          ? this.ppeRepo.findOne({
              where: { ppeProviderCode: dto.ppeProviderCode, ...live },
            })
          : null,
      ],
      [
        dto.hotWorkCode,
        'hotWorkCode',
        dto.hotWorkCode !== undefined
          ? this.hotWorkRepo.findOne({
              where: { hotWorkCode: dto.hotWorkCode, ...live },
            })
          : null,
      ],
      [
        dto.translatorCode,
        'translatorCode',
        dto.translatorCode !== undefined
          ? this.translatorRepo.findOne({
              where: { translatorCode: dto.translatorCode, ...live },
            })
          : null,
      ],
      [
        dto.engagementTypeCode,
        'engagementTypeCode',
        dto.engagementTypeCode !== undefined
          ? this.engagementRepo.findOne({
              where: { engagementTypeCode: dto.engagementTypeCode, ...live },
            })
          : null,
      ],
    ];

    for (const [value, label, promise] of optional) {
      if (promise) checks.push([`${label} ${value}`, promise]);
    }

    const results = await Promise.all(checks.map(([, p]) => p));
    const unknown = checks
      .filter((_, i) => !results[i])
      .map(([label]) => label);

    if (unknown.length > 0) {
      throw new NotFoundException(`Unknown or inactive: ${unknown.join(', ')}`);
    }
  }

  private recordEvent(
    visitId: string,
    eventType: VisitEventType,
    actor: string | null,
    note: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<CraneSiteVisitEvent> {
    return this.eventRepo.save(
      this.eventRepo.create({
        visitId,
        eventType,
        actor,
        note,
        metadata: metadata ?? null,
      }),
    );
  }

  private async notify(visit: CraneSiteVisit): Promise<void> {
    await this.mail.send({
      to: 'cranes@veltrixair.com',
      subject: `Site visit request ${visit.referenceNo} — ${visit.companyName}`,
      body: [
        `${visit.contactName} at ${visit.companyName} has requested a site visit.`,
        ``,
        `Reference:      ${visit.referenceNo}`,
        `Coordinate by:  ${visit.coordinationDueAt.toISOString()}`,
        `Report due:     ${visit.reportDueAt.toISOString()}`,
      ].join('\n'),
    });

    await this.mail.send({
      to: visit.businessEmail,
      subject: `We have your site visit request — ${visit.referenceNo}`,
      body: [
        `Hello ${visit.contactName},`,
        ``,
        `Thank you. Your reference is ${visit.referenceNo}.`,
        `An engineer will call you within 48 hours to agree a date, and you will have a written assessment within five working days of the visit.`,
        ``,
        `Track this request: /crane/site-visits/${visit.manageToken}`,
      ].join('\n'),
    });

    await this.recordEvent(
      visit.id,
      'NOTIFICATION_SENT',
      null,
      'Acknowledgement sent to customer and crane inbox',
    );
  }
}
