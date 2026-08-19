import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ReferenceNumberService } from '../common/services/reference-number.service';
import { SpamCheckService } from '../common/services/spam-check.service';
import { MailService } from '../mail/mail.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { ListEnquiriesDto } from './dto/list-enquiries.dto';
import { ContactEnquiryEvent } from './entities/contact-enquiry-event.entity';
import {
  ContactEnquiry,
  EnquiryStatus,
} from './entities/contact-enquiry.entity';
import { EnquiryRoutingService } from './enquiry-routing.service';

const REFERENCE_PREFIX = 'VLX';
const REFERENCE_SEQUENCE = 'contact_enquiry_ref_seq';

export interface SubmissionContext {
  ip?: string;
  userAgent?: string;
}

export interface EnquirySubmissionResult {
  referenceNo: string;
  slaDueAt: Date;
  message: string;
}

/** Columns safe to return in an admin list — no message, phone or ipHash. */
const LIST_COLUMNS = [
  'enquiry.id',
  'enquiry.referenceNo',
  'enquiry.topicCode',
  'enquiry.fullName',
  'enquiry.company',
  'enquiry.roleTitle',
  'enquiry.workEmail',
  'enquiry.countryCode',
  'enquiry.industryCode',
  'enquiry.timelineCode',
  'enquiry.requiresNda',
  'enquiry.officeCode',
  'enquiry.routedToEmail',
  'enquiry.slaDueAt',
  'enquiry.firstRespondedAt',
  'enquiry.status',
  'enquiry.assignedTo',
  'enquiry.spamScore',
  'enquiry.createdDate',
];

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @InjectRepository(ContactEnquiry)
    private readonly enquiryRepo: Repository<ContactEnquiry>,
    @InjectRepository(ContactEnquiryEvent)
    private readonly eventRepo: Repository<ContactEnquiryEvent>,
    private readonly dataSource: DataSource,
    private readonly routing: EnquiryRoutingService,
    private readonly referenceNumbers: ReferenceNumberService,
    private readonly spamCheck: SpamCheckService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // -----------------------------------------------------------------------
  // Public submission
  // -----------------------------------------------------------------------

  async submit(
    dto: CreateEnquiryDto,
    context: SubmissionContext,
    siteCode: number,
  ): Promise<EnquirySubmissionResult> {
    const submittedAt = new Date();

    const spam = await this.spamCheck.evaluate({
      honeypot: dto.website,
      captchaToken: dto.captchaToken,
      email: dto.workEmail,
      ip: context.ip,
    });

    const routing = await this.routing.resolve(
      siteCode,
      dto.topicCode,
      dto.countryCode,
      submittedAt,
    );

    const enquiry = await this.dataSource.transaction(async (manager) => {
      const referenceNo = await this.referenceNumbers.next(
        REFERENCE_PREFIX,
        REFERENCE_SEQUENCE,
        manager,
      );

      const record = manager.create(ContactEnquiry, {
        referenceNo,
        siteCode,
        topicCode: dto.topicCode,
        fullName: dto.fullName,
        company: dto.company,
        roleTitle: dto.roleTitle ?? null,
        workEmail: dto.workEmail,
        phone: dto.phone ?? null,
        countryCode: dto.countryCode,
        industryCode: dto.industryCode ?? null,
        timelineCode: dto.timelineCode ?? null,
        message: dto.message,
        requiresNda: dto.requiresNda ?? false,
        consentAt: submittedAt,
        privacyNoticeVersion: this.config.getOrThrow<string>(
          'PRIVACY_NOTICE_VERSION',
        ),
        officeCode: routing.office.officeCode,
        routedToEmail: routing.routedToEmail,
        slaDueAt: routing.slaDueAt,
        // Suspected spam is stored, never rejected — a false positive must not
        // lose a real enterprise lead.
        status: spam.isSpam ? 'SPAM' : 'NEW',
        sourcePage: dto.sourcePage ?? null,
        utmSource: dto.utmSource ?? null,
        utmMedium: dto.utmMedium ?? null,
        utmCampaign: dto.utmCampaign ?? null,
        ipHash: this.spamCheck.hashIp(context.ip),
        userAgent: context.userAgent ?? null,
        spamScore: spam.score,
      });

      const saved = await manager.save(ContactEnquiry, record);

      await manager.save(
        manager.create(ContactEnquiryEvent, {
          enquiryId: saved.id,
          eventType: 'CREATED',
          actor: null,
          note: null,
          metadata: {
            spamScore: spam.score,
            spamReasons: spam.reasons,
            office: routing.office.officeName,
            routedTo: routing.routedToEmail,
          },
        }),
      );

      return saved;
    });

    // Mail goes out after commit. The enquiry is already durable; a provider
    // outage must not fail the request.
    if (!spam.isSpam) {
      await this.sendNotifications(enquiry, routing.office.officeName);
    }

    return {
      referenceNo: enquiry.referenceNo,
      slaDueAt: enquiry.slaDueAt,
      message:
        'Thank you — your enquiry is on its way. A senior practitioner will review your message and respond within one business day.',
    };
  }

  private async sendNotifications(
    enquiry: ContactEnquiry,
    officeName: string,
  ): Promise<void> {
    // The submitter ticked "includes confidential information" — the message
    // body must not travel by email. Link to the admin record instead.
    const internalBody = enquiry.requiresNda
      ? [
          `New enquiry ${enquiry.referenceNo} (NDA REQUESTED)`,
          ``,
          `From:    ${enquiry.fullName}, ${enquiry.company}`,
          `Email:   ${enquiry.workEmail}`,
          `Office:  ${officeName}`,
          `Due by:  ${enquiry.slaDueAt.toISOString()}`,
          ``,
          `The submitter marked this enquiry confidential and asked for a mutual NDA.`,
          `The message body is deliberately withheld from this email — open the`,
          `enquiry in the admin panel to read it. That access is logged.`,
        ].join('\n')
      : [
          `New enquiry ${enquiry.referenceNo}`,
          ``,
          `From:    ${enquiry.fullName}, ${enquiry.company}`,
          `Email:   ${enquiry.workEmail}`,
          `Office:  ${officeName}`,
          `Due by:  ${enquiry.slaDueAt.toISOString()}`,
          ``,
          enquiry.message,
        ].join('\n');

    await this.mail.send({
      to: enquiry.routedToEmail,
      subject: `[${enquiry.referenceNo}] ${enquiry.company} — new enquiry`,
      body: internalBody,
      replyTo: enquiry.workEmail,
    });

    await this.mail.send({
      to: enquiry.workEmail,
      subject: `We've received your enquiry (${enquiry.referenceNo})`,
      body: [
        `Hello ${enquiry.fullName},`,
        ``,
        `Thank you for contacting Veltrixair. Your reference is ${enquiry.referenceNo}.`,
        ``,
        `A senior practitioner will review your message and respond within one`,
        `business day, in your local time zone.`,
        ``,
        `— Veltrixair`,
      ].join('\n'),
    });

    await this.eventRepo.save(
      this.eventRepo.create({
        enquiryId: enquiry.id,
        eventType: 'NOTIFICATION_SENT',
        metadata: { routedTo: enquiry.routedToEmail },
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Admin
  // -----------------------------------------------------------------------

  async list(
    query: ListEnquiriesDto,
    siteCode: number,
  ): Promise<PaginatedResult<ContactEnquiry>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.enquiryRepo
      .createQueryBuilder('enquiry')
      .select(LIST_COLUMNS)
      .where('enquiry.isDeleted = false')
      .andWhere('enquiry.siteCode = :siteCode', { siteCode });

    if (query.status) {
      qb.andWhere('enquiry.status = :status', { status: query.status });
    }
    if (query.topicCode !== undefined) {
      qb.andWhere('enquiry.topicCode = :topicCode', {
        topicCode: query.topicCode,
      });
    }
    if (query.officeCode !== undefined) {
      qb.andWhere('enquiry.officeCode = :officeCode', {
        officeCode: query.officeCode,
      });
    }
    if (query.search) {
      qb.andWhere(
        '(enquiry.company ILIKE :search OR enquiry.fullName ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.overdue === 'true') {
      qb.andWhere('enquiry.firstRespondedAt IS NULL').andWhere(
        'enquiry.slaDueAt < now()',
      );
    }

    const [items, total] = await qb
      .orderBy('enquiry.createdDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Full record including the message body. Reading an NDA-flagged enquiry is
   * recorded as a MESSAGE_VIEWED event.
   */
  async findOne(
    id: string,
    actor: string | null,
    siteCode: number,
  ): Promise<ContactEnquiry> {
    const enquiry = await this.enquiryRepo
      .createQueryBuilder('enquiry')
      .addSelect(['enquiry.message', 'enquiry.phone'])
      .where('enquiry.id = :id', { id })
      .andWhere('enquiry.isDeleted = false')
      .andWhere('enquiry.siteCode = :siteCode', { siteCode })
      .getOne();

    if (!enquiry) {
      throw new NotFoundException(`Enquiry ${id} not found`);
    }

    if (enquiry.requiresNda) {
      await this.eventRepo.save(
        this.eventRepo.create({
          enquiryId: enquiry.id,
          eventType: 'MESSAGE_VIEWED',
          actor,
          note: 'Confidential enquiry opened',
        }),
      );
    }

    return enquiry;
  }

  async listEvents(
    id: string,
    siteCode: number,
  ): Promise<ContactEnquiryEvent[]> {
    await this.assertExists(id, siteCode);
    return this.eventRepo.find({
      where: { enquiryId: id },
      order: { createdDate: 'ASC' },
    });
  }

  async updateStatus(
    id: string,
    status: EnquiryStatus,
    note: string | undefined,
    actor: string | null,
    siteCode: number,
  ): Promise<ContactEnquiry> {
    const enquiry = await this.assertExists(id, siteCode);
    const previous = enquiry.status;

    const patch: Partial<ContactEnquiry> = { status };

    // First move into a working status is the first substantive response, and
    // stops the SLA clock. Deliberately not conditioned on the previous status:
    // an enquiry rescued from a spam false-positive is still being responded to
    // for the first time.
    if (!enquiry.firstRespondedAt && status !== 'NEW' && status !== 'SPAM') {
      patch.firstRespondedAt = new Date();
    }

    await this.enquiryRepo.update({ id }, patch);

    await this.eventRepo.save(
      this.eventRepo.create({
        enquiryId: id,
        eventType: 'STATUS_CHANGED',
        actor,
        note: note ?? null,
        metadata: { from: previous, to: status },
      }),
    );

    return this.assertExists(id, siteCode);
  }

  async assign(
    id: string,
    assignedTo: string,
    actor: string | null,
    siteCode: number,
  ): Promise<ContactEnquiry> {
    await this.assertExists(id, siteCode);
    await this.enquiryRepo.update({ id }, { assignedTo });

    await this.eventRepo.save(
      this.eventRepo.create({
        enquiryId: id,
        eventType: 'ASSIGNED',
        actor,
        metadata: { assignedTo },
      }),
    );

    return this.assertExists(id, siteCode);
  }

  async addNote(
    id: string,
    note: string,
    actor: string | null,
    siteCode: number,
  ): Promise<ContactEnquiryEvent> {
    await this.assertExists(id, siteCode);

    return this.eventRepo.save(
      this.eventRepo.create({
        enquiryId: id,
        eventType: 'NOTE_ADDED',
        actor,
        note,
      }),
    );
  }

  /**
   * The single place an enquiry is fetched by id for a mutation.
   *
   * Filtering on site here rather than in each caller means listEvents,
   * updateStatus, assign and addNote are all bound to the brand by one line —
   * and a wrong-site id is a 404, not a 403, because whether a record exists on
   * another brand is not something to confirm.
   */
  private async assertExists(
    id: string,
    siteCode: number,
  ): Promise<ContactEnquiry> {
    const enquiry = await this.enquiryRepo.findOne({
      where: { id, isDeleted: false, siteCode },
    });
    if (!enquiry) {
      throw new NotFoundException(`Enquiry ${id} not found`);
    }
    return enquiry;
  }
}
