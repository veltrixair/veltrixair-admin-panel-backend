import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/pagination-query.dto';
import { ReferenceNumberService } from '../../common/services/reference-number.service';
import { SpamCheckService } from '../../common/services/spam-check.service';
import { addBusinessDays } from '../../common/utils/business-hours.util';
import { OfficeMaster } from '../../master-data/entities/office-master.entity';
import { MailService } from '../../mail/mail.service';
import { PrivacyJurisdictionMaster } from '../masters/entities/privacy-jurisdiction-master.entity';
import { PrivacyServiceMaster } from '../masters/entities/privacy-service-master.entity';
import { CreatePrivacyContactDto } from './dto/create-privacy-contact.dto';
import { ListPrivacyContactDto } from './dto/manage-privacy-contact.dto';
import { PrivacyContactEvent } from './entities/privacy-contact-event.entity';
import { PrivacyContactEnquiry } from './entities/privacy-contact-enquiry.entity';
import type { PrivacyEnquiryStatus } from './entities/privacy-contact-enquiry.entity';
import { FEATURE } from '../../auth/permissions.constants';
import { NotificationService } from '../../notifications/notification.service';

const REFERENCE_PREFIX = 'VDP-ENQ';
const REFERENCE_SEQUENCE = 'privacy_contact_ref_seq';

/** "We acknowledge every brief within one working day." */
export const PRIVACY_SLA_BUSINESS_DAYS = 1;

/** The privacy practice is site 103 and only site 103. */
export const SITE_CODE = 103;

export interface SubmissionContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Columns safe to return in a list — no brief, phone or ipHash.
 *
 * The brief is the sensitive one: a privacy brief routinely names data
 * subjects, systems and incidents, so it is fetched only when a practitioner
 * opens the record.
 */
const LIST_COLUMNS = [
  'enquiry.id',
  'enquiry.referenceNo',
  'enquiry.fullName',
  'enquiry.organisation',
  'enquiry.workEmail',
  'enquiry.roleTitle',
  'enquiry.jurisdictionCode',
  'enquiry.serviceCode',
  'enquiry.lawfulBasis',
  'enquiry.officeCode',
  'enquiry.routedToEmail',
  'enquiry.slaDueAt',
  'enquiry.firstRespondedAt',
  'enquiry.status',
  'enquiry.assignedTo',
  'enquiry.assignedAt',
  'enquiry.spamScore',
  'enquiry.createdDate',
];

@Injectable()
export class PrivacyContactService {
  private readonly logger = new Logger(PrivacyContactService.name);

  constructor(
    @InjectRepository(PrivacyContactEnquiry)
    private readonly enquiryRepo: Repository<PrivacyContactEnquiry>,
    @InjectRepository(PrivacyContactEvent)
    private readonly eventRepo: Repository<PrivacyContactEvent>,
    @InjectRepository(PrivacyJurisdictionMaster)
    private readonly jurisdictionRepo: Repository<PrivacyJurisdictionMaster>,
    @InjectRepository(PrivacyServiceMaster)
    private readonly serviceRepo: Repository<PrivacyServiceMaster>,
    @InjectRepository(OfficeMaster)
    private readonly officeRepo: Repository<OfficeMaster>,
    private readonly dataSource: DataSource,
    private readonly referenceNumbers: ReferenceNumberService,
    private readonly spamCheck: SpamCheckService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  // =======================================================================
  // Public — the form
  // =======================================================================

  /** Both dropdowns on the contact form. */
  async formOptions(): Promise<{
    jurisdictions: { code: number; label: string; regulation: string }[];
    services: { code: number; label: string }[];
  }> {
    const live = {
      where: { siteCode: SITE_CODE, isActive: true, isDeleted: false },
      order: { displayOrder: 'ASC' as const },
    };

    const [jurisdictions, services] = await Promise.all([
      this.jurisdictionRepo.find(live),
      this.serviceRepo.find(live),
    ]);

    return {
      jurisdictions: jurisdictions.map((j) => ({
        code: j.jurisdictionCode,
        label: `${j.jurisdictionName} — ${j.regulation}`,
        regulation: j.regulation,
      })),
      services: services.map((s) => ({
        code: s.serviceCode,
        label: s.serviceName,
      })),
    };
  }

  async submit(
    dto: CreatePrivacyContactDto,
    context: SubmissionContext,
  ): Promise<{ referenceNo: string; slaDueAt: Date; message: string }> {
    const submittedAt = new Date();

    const spam = await this.spamCheck.evaluate({
      honeypot: dto.website,
      captchaToken: dto.captchaToken,
      email: dto.workEmail,
      ip: context.ip,
    });

    const { jurisdiction, service, office } = await this.resolveRouting(dto);

    // The clock runs on the owning office's working week, not the server's —
    // Riyadh is Sunday to Thursday, the India office Monday to Friday.
    const slaDueAt = addBusinessDays(submittedAt, PRIVACY_SLA_BUSINESS_DAYS, {
      timezone: office.timezone,
      workingDays: office.workingDays,
      workStartHour: office.workStartHour,
      workEndHour: office.workEndHour,
    });

    const enquiry = await this.dataSource.transaction(async (manager) => {
      const referenceNo = await this.referenceNumbers.next(
        REFERENCE_PREFIX,
        REFERENCE_SEQUENCE,
        manager,
      );

      const saved = await manager.save(
        manager.create(PrivacyContactEnquiry, {
          referenceNo,
          siteCode: SITE_CODE,
          fullName: dto.fullName,
          organisation: dto.organisation,
          workEmail: dto.workEmail,
          phone: dto.phone ?? null,
          roleTitle: dto.roleTitle ?? null,
          jurisdictionCode: jurisdiction.jurisdictionCode,
          serviceCode: service.serviceCode,
          brief: dto.brief,
          // No tick was shown, so no consent timestamp is manufactured.
          lawfulBasis: 'LEGITIMATE_INTEREST',
          consentAt: null,
          privacyNoticeVersion: this.config.getOrThrow<string>(
            'PRIVACY_NOTICE_VERSION',
          ),
          officeCode: office.officeCode,
          routedToEmail: service.routeEmail,
          slaDueAt,
          // Suspected spam is stored, never rejected — a false positive must
          // not lose a real enquiry.
          status: spam.isSpam ? 'SPAM' : 'NEW',
          sourcePage: dto.sourcePage ?? null,
          utmSource: dto.utmSource ?? null,
          utmMedium: dto.utmMedium ?? null,
          utmCampaign: dto.utmCampaign ?? null,
          ipHash: this.spamCheck.hashIp(context.ip),
          userAgent: context.userAgent ?? null,
          spamScore: spam.score,
        }),
      );

      await manager.save(
        manager.create(PrivacyContactEvent, {
          enquiryId: saved.id,
          eventType: 'CREATED',
          actor: null,
          note: null,
          metadata: {
            spamScore: spam.score,
            spamReasons: spam.reasons,
            jurisdiction: `${jurisdiction.jurisdictionName} — ${jurisdiction.regulation}`,
            service: service.serviceName,
            office: office.officeName,
            routedTo: service.routeEmail,
          },
        }),
      );

      return saved;
    });

    // Mail goes out after commit. The enquiry is already durable; a provider
    // outage must not fail the request.
    if (!spam.isSpam) {
      await this.notify(enquiry, jurisdiction, service, office, dto.brief);
    }

    this.logger.log(
      `Privacy enquiry ${enquiry.referenceNo} from ${enquiry.organisation}`,
    );

    // Its own feature, and the "Contact us" heading — the privacy practice's
    // enquiries are a separate permission from IT's, but they read the same
    // way on the screen.
    await this.notifications.raise({
      siteCode: SITE_CODE,
      featureCode: FEATURE.PRIVACY_ENQUIRIES,
      category: 'contact',
      lead: 'Privacy enquiry',
      body: `${enquiry.fullName} · ${enquiry.organisation}`,
      link: `/dp/contact/${enquiry.id}`,
      sourceType: 'privacy_enquiry',
      sourceId: enquiry.id,
    });

    return {
      referenceNo: enquiry.referenceNo,
      slaDueAt: enquiry.slaDueAt,
      message:
        `Thank you — your reference is ${enquiry.referenceNo}. ` +
        'A senior practitioner will acknowledge your brief within one working day.',
    };
  }

  // =======================================================================
  // Admin
  // =======================================================================

  async list(
    query: ListPrivacyContactDto,
    siteCode: number,
  ): Promise<PaginatedResult<PrivacyContactEnquiry>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.scoped(siteCode)
      .select(LIST_COLUMNS)
      .orderBy('enquiry.createdDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('enquiry.status = :status', { status: query.status });
    }
    if (query.jurisdictionCode !== undefined) {
      qb.andWhere('enquiry.jurisdictionCode = :jurisdictionCode', {
        jurisdictionCode: query.jurisdictionCode,
      });
    }
    if (query.serviceCode !== undefined) {
      qb.andWhere('enquiry.serviceCode = :serviceCode', {
        serviceCode: query.serviceCode,
      });
    }
    if (query.unassigned) {
      qb.andWhere('enquiry.assignedTo IS NULL');
    }
    if (query.overdue) {
      qb.andWhere('enquiry.firstRespondedAt IS NULL').andWhere(
        'enquiry.slaDueAt < now()',
      );
    }
    if (query.search) {
      qb.andWhere(
        '(enquiry.fullName ILIKE :q OR enquiry.organisation ILIKE :q ' +
          'OR enquiry.workEmail ILIKE :q OR enquiry.referenceNo ILIKE :q)',
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

  /** The full record, including the withheld columns. */
  async findById(id: string, siteCode: number): Promise<PrivacyContactEnquiry> {
    const enquiry = await this.scoped(siteCode)
      .addSelect(['enquiry.brief', 'enquiry.phone'])
      .andWhere('enquiry.id = :id', { id })
      .getOne();

    if (!enquiry) {
      throw new NotFoundException(`Privacy enquiry ${id} not found`);
    }
    return enquiry;
  }

  async listEvents(
    id: string,
    siteCode: number,
  ): Promise<PrivacyContactEvent[]> {
    await this.findById(id, siteCode);
    return this.eventRepo.find({
      where: { enquiryId: id },
      order: { createdDate: 'ASC' },
    });
  }

  async setStatus(
    id: string,
    status: PrivacyEnquiryStatus,
    note: string | undefined,
    actor: string,
    siteCode: number,
  ): Promise<PrivacyContactEnquiry> {
    const enquiry = await this.findById(id, siteCode);
    const previous = enquiry.status;

    enquiry.status = status;
    // The first move off NEW is the acknowledgement the page promises, so it is
    // what stops the clock.
    if (previous === 'NEW' && status !== 'NEW' && !enquiry.firstRespondedAt) {
      enquiry.firstRespondedAt = new Date();
    }
    await this.enquiryRepo.save(enquiry);

    await this.eventRepo.save(
      this.eventRepo.create({
        enquiryId: id,
        eventType: 'STATUS_CHANGED',
        actor,
        note: note ?? null,
        metadata: { from: previous, to: status },
      }),
    );

    return this.findById(id, siteCode);
  }

  /** Passing null hands the enquiry back to the unassigned queue. */
  async assign(
    id: string,
    assignedTo: string | null | undefined,
    actor: string,
    siteCode: number,
  ): Promise<PrivacyContactEnquiry> {
    const enquiry = await this.findById(id, siteCode);
    const previous = enquiry.assignedTo;
    const next = assignedTo ?? null;

    // Held together deliberately — a CHECK constraint refuses one without the
    // other, so that "assigned how long ago" can never read as null.
    enquiry.assignedTo = next;
    enquiry.assignedAt = next ? new Date() : null;
    await this.enquiryRepo.save(enquiry);

    await this.eventRepo.save(
      this.eventRepo.create({
        enquiryId: id,
        eventType: next ? 'ASSIGNED' : 'UNASSIGNED',
        actor,
        note: null,
        metadata: { from: previous, to: next },
      }),
    );

    return this.findById(id, siteCode);
  }

  async addNote(
    id: string,
    note: string,
    actor: string,
    siteCode: number,
  ): Promise<PrivacyContactEvent> {
    await this.findById(id, siteCode);
    return this.eventRepo.save(
      this.eventRepo.create({
        enquiryId: id,
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

  /**
   * The one place an admin query is bound to a brand and to undeleted rows.
   *
   * Takes the SIGNED-IN ADMIN'S site rather than this module's constant. That
   * distinction is the whole lock: `role_permissions` has no site dimension, so
   * SUPER_ADMIN holds this feature on every dashboard and the guard alone would
   * let an IT badge read privacy enquiries. Binding to the badge's site makes
   * the wrong dashboard see an empty list and 404 on any id — the same
   * behaviour the shared contact module already has.
   */
  private scoped(siteCode: number) {
    return this.enquiryRepo
      .createQueryBuilder('enquiry')
      .where('enquiry.siteCode = :siteCode', { siteCode })
      .andWhere('enquiry.isDeleted = false');
  }

  /**
   * Jurisdiction decides the office, the service decides the inbox.
   *
   * Both rules live in master data rather than in code, so re-pointing a
   * service at a different practitioner is a data edit, not a deploy.
   */
  private async resolveRouting(dto: CreatePrivacyContactDto): Promise<{
    jurisdiction: PrivacyJurisdictionMaster;
    service: PrivacyServiceMaster;
    office: OfficeMaster;
  }> {
    const live = { siteCode: SITE_CODE, isActive: true, isDeleted: false };

    const [jurisdiction, service] = await Promise.all([
      this.jurisdictionRepo.findOne({
        where: { jurisdictionCode: dto.jurisdictionCode, ...live },
      }),
      this.serviceRepo.findOne({
        where: { serviceCode: dto.serviceCode, ...live },
      }),
    ]);

    if (!jurisdiction) {
      throw new NotFoundException(
        `Unknown jurisdiction: ${dto.jurisdictionCode}`,
      );
    }
    if (!service) {
      throw new NotFoundException(`Unknown service: ${dto.serviceCode}`);
    }

    const office = await this.officeRepo.findOne({
      where: { officeCode: jurisdiction.officeCode, ...live },
    });
    if (!office) {
      throw new NotFoundException(`Unknown office: ${jurisdiction.officeCode}`);
    }

    return { jurisdiction, service, office };
  }

  private async notify(
    enquiry: PrivacyContactEnquiry,
    jurisdiction: PrivacyJurisdictionMaster,
    service: PrivacyServiceMaster,
    office: OfficeMaster,
    brief: string,
  ): Promise<void> {
    await this.mail.send({
      to: enquiry.routedToEmail,
      subject: `[${enquiry.referenceNo}] ${enquiry.organisation} — privacy brief`,
      body: [
        `New privacy brief ${enquiry.referenceNo}`,
        ``,
        `From:         ${enquiry.fullName}${enquiry.roleTitle ? `, ${enquiry.roleTitle}` : ''}`,
        `Organisation: ${enquiry.organisation}`,
        `Email:        ${enquiry.workEmail}`,
        `Jurisdiction: ${jurisdiction.jurisdictionName} — ${jurisdiction.regulation}`,
        `Service:      ${service.serviceName}`,
        `Office:       ${office.officeName}`,
        `Due by:       ${enquiry.slaDueAt.toISOString()}`,
        ``,
        brief,
      ].join('\n'),
      replyTo: enquiry.workEmail,
    });

    await this.mail.send({
      to: enquiry.workEmail,
      subject: `We've received your brief (${enquiry.referenceNo})`,
      body: [
        `Hello ${enquiry.fullName},`,
        ``,
        `Thank you for briefing the practice. Your reference is ${enquiry.referenceNo}.`,
        ``,
        `A senior practitioner will acknowledge your brief within one working day.`,
        ``,
        `— Veltrixair Data Privacy`,
      ].join('\n'),
    });

    await this.eventRepo.save(
      this.eventRepo.create({
        enquiryId: enquiry.id,
        eventType: 'NOTIFICATION_SENT',
        actor: null,
        note: null,
        metadata: { routedTo: enquiry.routedToEmail },
      }),
    );
  }
}
