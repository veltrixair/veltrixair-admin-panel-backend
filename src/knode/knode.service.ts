import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ReferenceNumberService } from '../common/services/reference-number.service';
import { SpamCheckService } from '../common/services/spam-check.service';
import { NotificationService } from '../notifications/notification.service';
import { FEATURE } from '../auth/permissions.constants';
import { CreateKnodeLeadDto } from './dto/create-knode-lead.dto';
import { ListKnodeLeadsDto } from './dto/list-knode-leads.dto';
import { KnodeLeadEvent } from './entities/knode-lead-event.entity';
import { KnodeLead, statusesFor } from './entities/knode-lead.entity';
import type {
  KnodeLeadStatus,
  KnodeLeadType,
} from './entities/knode-lead.entity';

const MEETING_PREFIX = 'KND-MTG';
const CLIENT_PREFIX = 'KND-CNF';
const MEETING_SEQUENCE = 'knode_meeting_ref_seq';
const CLIENT_SEQUENCE = 'knode_client_ref_seq';

/** Four digits, so the reference reads as the deck's mockup showed it. */
const REFERENCE_PAD = 4;

export interface CaptureContext {
  ip?: string;
  userAgent?: string;
}

export interface KnodeLeadResult {
  referenceNo: string;
  /** False when this key had already been recorded — the row is unchanged. */
  created: boolean;
}

export interface KnodeSyncResult {
  received: number;
  created: number;
  duplicates: number;
  references: string[];
}

export interface KnodeStats {
  meetings: number;
  meetingsNew: number;
  clients: number;
  clientsNew: number;
  /** Demos booked between today and seven days out, still going ahead. */
  upcomingThisWeek: number;
}

/**
 * Columns safe to return in a list — no notes, no ipHash.
 *
 * The WhatsApp number IS here, unlike the phone on a contact enquiry or the
 * mobile on a crane application. Those are withheld because such a list is a
 * pile of personal data belonging to people who never asked to be called, and
 * on the crane board it sits beside nationality and residency status.
 *
 * This is a different case on every count. The number is a business contact a
 * hospital director handed a rep across a table for the express purpose of
 * being messaged on it; WhatsApp is this desk's primary channel rather than an
 * afterthought; and KNODE is granted to Super Admin and Sales alone — the
 * people whose job is to make that call. Withholding it left the list unable
 * to serve its one purpose, deciding who to contact next.
 *
 * `notes` stays withheld: that is the substance of a private conversation,
 * and it belongs on the record somebody deliberately opened.
 */
const LIST_COLUMNS = [
  'lead.id',
  'lead.referenceNo',
  'lead.leadType',
  'lead.hospitalName',
  'lead.contactPerson',
  'lead.designation',
  'lead.whatsapp',
  'lead.email',
  'lead.meetingDate',
  'lead.meetingTime',
  'lead.status',
  'lead.assignedTo',
  'lead.savedAt',
  'lead.createdDate',
];

@Injectable()
export class KnodeService {
  private readonly logger = new Logger(KnodeService.name);

  constructor(
    @InjectRepository(KnodeLead)
    private readonly leadRepo: Repository<KnodeLead>,
    @InjectRepository(KnodeLeadEvent)
    private readonly eventRepo: Repository<KnodeLeadEvent>,
    private readonly dataSource: DataSource,
    private readonly referenceNumbers: ReferenceNumberService,
    private readonly spamCheck: SpamCheckService,
    private readonly notifications: NotificationService,
  ) {}

  // -----------------------------------------------------------------------
  // Capture — from the deck
  // -----------------------------------------------------------------------

  /**
   * Record one lead.
   *
   * Idempotent on `clientKey`: a deck retrying a queued record gets the same
   * reference back and nothing is written twice. That is the whole reason the
   * key is required, and it is why a duplicate is a success rather than a 409
   * — the rep did nothing wrong, and the client has no way to distinguish
   * "already sent" from "never arrived".
   */
  async capture(
    dto: CreateKnodeLeadDto,
    context: CaptureContext,
    siteCode: number,
  ): Promise<KnodeLeadResult> {
    const existing = await this.leadRepo.findOne({
      where: { clientKey: dto.clientKey },
      select: ['id', 'referenceNo'],
    });

    if (existing) {
      return { referenceNo: existing.referenceNo, created: false };
    }

    this.assertMeetingHasWhen(dto);

    const isMeeting = dto.type === 'MEETING_SCHEDULED';

    const captured = await this.dataSource.transaction(async (manager) => {
      const referenceNo = await this.referenceNumbers.next(
        isMeeting ? MEETING_PREFIX : CLIENT_PREFIX,
        isMeeting ? MEETING_SEQUENCE : CLIENT_SEQUENCE,
        manager,
        REFERENCE_PAD,
      );

      const lead = manager.create(KnodeLead, {
        siteCode,
        referenceNo,
        clientKey: dto.clientKey,
        leadType: dto.type,
        hospitalName: dto.hospital.trim(),
        contactPerson: dto.person.trim(),
        designation: dto.designation?.trim() || null,
        whatsapp: dto.whatsapp.trim(),
        email: dto.email?.trim().toLowerCase() || null,
        // A confirmed client has no meeting to hold, so these stay null even
        // if the deck sent them.
        meetingDate: isMeeting ? (dto.date ?? null) : null,
        meetingTime: isMeeting ? (dto.time ?? null) : null,
        notes: dto.notes?.trim() || null,
        status: 'NEW',
        savedAt: new Date(dto.savedAt),
        syncedAt: new Date(),
        ipHash: this.spamCheck.hashIp(context.ip),
        userAgent: context.userAgent ?? null,
      });

      const saved = await manager.save(lead);

      const savedAt = new Date(dto.savedAt);
      const delayMinutes = Math.round(
        (Date.now() - savedAt.getTime()) / 60_000,
      );

      await manager.save(
        manager.create(KnodeLeadEvent, {
          leadId: saved.id,
          eventType: 'CREATED',
          actor: null,
          note: null,
          // Whether this arrived live or off a queue is worth keeping: it is
          // the difference between "saved two minutes ago" and "saved on
          // Tuesday and only reached us now".
          metadata: {
            leadType: dto.type,
            savedAt: dto.savedAt,
            delayMinutes,
            queued: delayMinutes > 5,
          },
        }),
      );

      this.logger.log(
        `Knode lead ${referenceNo} captured — ${dto.hospital} (${dto.type})`,
      );

      return { referenceNo, id: saved.id, delayMinutes };
    });

    /*
     * Announced after the transaction, never inside it.
     *
     * A notification is a side effect of the capture, not part of it: raising
     * it within the transaction would let a failed announcement roll back a
     * lead that is otherwise perfectly saved. `raise` swallows its own errors
     * for the same reason.
     *
     * Only reached when the row was genuinely new — an idempotent re-send
     * returns above, so a rep flushing a queue twice rings the bell once.
     */
    await this.notifications.raise({
      siteCode,
      featureCode: FEATURE.KNODE,
      category: 'knode',
      lead: isMeeting ? 'Demo booked on the deck' : 'Client confirmed on the deck',
      body: isMeeting
        ? `${dto.hospital.trim()} · ${dto.person.trim()} · demo ${dto.date ?? 'TBC'} ${dto.time ?? ''}`.trim()
        : `${dto.hospital.trim()} · ${dto.person.trim()}`,
      // The uuid, not the reference number. Every route in the panel puts a
      // uuid pipe on :id, so a link built from KND-MTG-… reaches the right
      // screen and then 400s — which has happened twice on other desks.
      link: `/knode/${captured.id}`,
      sourceType: 'knode_lead',
      sourceId: captured.id,
      // No actor: the deck is a sales tool, not a signed-in administrator, so
      // there is nobody to exclude from their own notification.
    });

    return { referenceNo: captured.referenceNo, created: true };
  }

  /**
   * Flush an offline queue.
   *
   * Each lead is captured on its own rather than in one transaction: one bad
   * record in a rep's backlog must not reject the other nineteen, and every
   * capture is already idempotent so a partial run is simply re-sent.
   */
  async sync(
    leads: CreateKnodeLeadDto[],
    context: CaptureContext,
    siteCode: number,
  ): Promise<KnodeSyncResult> {
    const references: string[] = [];
    let created = 0;
    let duplicates = 0;

    for (const dto of leads) {
      const result = await this.capture(dto, context, siteCode);
      references.push(result.referenceNo);
      if (result.created) created += 1;
      else duplicates += 1;
    }

    this.logger.log(
      `Knode sync — ${leads.length} received, ${created} new, ${duplicates} already held`,
    );

    return { received: leads.length, created, duplicates, references };
  }

  /**
   * A meeting nobody can attend is not a meeting.
   *
   * Enforced here rather than in the DTO because it depends on `type`, which
   * class-validator cannot condition on cleanly across two optional fields.
   */
  private assertMeetingHasWhen(dto: CreateKnodeLeadDto): void {
    if (dto.type !== 'MEETING_SCHEDULED') return;
    if (dto.date && dto.time) return;

    throw new BadRequestException(
      'A scheduled meeting needs both a date and a time.',
    );
  }

  // -----------------------------------------------------------------------
  // Admin
  // -----------------------------------------------------------------------

  async list(
    query: ListKnodeLeadsDto,
    siteCode: number,
  ): Promise<PaginatedResult<KnodeLead>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.leadRepo
      .createQueryBuilder('lead')
      .select(LIST_COLUMNS)
      .where('lead.isDeleted = false')
      .andWhere('lead.siteCode = :siteCode', { siteCode });

    if (query.type) {
      qb.andWhere('lead.leadType = :leadType', { leadType: query.type });
    }
    if (query.status) {
      qb.andWhere('lead.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere(
        '(lead.hospitalName ILIKE :search OR lead.contactPerson ILIKE :search' +
          ' OR lead.referenceNo ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.unassigned === 'true') {
      qb.andWhere('lead.assignedTo IS NULL');
    }
    if (query.upcoming === 'true') {
      qb.andWhere('lead.leadType = :upcomingType', {
        upcomingType: 'MEETING_SCHEDULED',
      })
        .andWhere('lead.meetingDate >= CURRENT_DATE')
        .andWhere("lead.meetingDate <= CURRENT_DATE + INTERVAL '7 days'")
        .andWhere('lead.status NOT IN (:...settled)', {
          settled: ['DONE', 'CANCELLED'],
        });
    }

    /*
     * Meetings sort by when they are, soonest first — the coordinator needs
     * tomorrow's demo before last month's. Confirmed clients have no date, so
     * they fall back to newest first. NULLS LAST keeps the two coherent when
     * the list is unfiltered.
     */
    const [items, total] = await qb
      .orderBy('lead.meetingDate', 'ASC', 'NULLS LAST')
      .addOrderBy('lead.savedAt', 'DESC')
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

  /** Everything, including the WhatsApp number and the notes from the room. */
  async findOne(id: string, siteCode: number): Promise<KnodeLead> {
    const lead = await this.leadRepo
      .createQueryBuilder('lead')
      .addSelect(['lead.whatsapp', 'lead.notes'])
      .where('lead.id = :id', { id })
      .andWhere('lead.siteCode = :siteCode', { siteCode })
      .andWhere('lead.isDeleted = false')
      .getOne();

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  listEvents(id: string, siteCode: number): Promise<KnodeLeadEvent[]> {
    return this.assertExists(id, siteCode).then(() =>
      this.eventRepo.find({
        where: { leadId: id },
        order: { createdDate: 'DESC' },
      }),
    );
  }

  /** The four tiles on the Knode screen, counted server-side. */
  async stats(siteCode: number): Promise<KnodeStats> {
    const base = () =>
      this.leadRepo
        .createQueryBuilder('lead')
        .where('lead.isDeleted = false')
        .andWhere('lead.siteCode = :siteCode', { siteCode });

    const countOf = (type: KnodeLeadType, onlyNew = false) => {
      const qb = base().andWhere('lead.leadType = :type', { type });
      if (onlyNew) qb.andWhere("lead.status = 'NEW'");
      return qb.getCount();
    };

    const [meetings, meetingsNew, clients, clientsNew, upcomingThisWeek] =
      await Promise.all([
        countOf('MEETING_SCHEDULED'),
        countOf('MEETING_SCHEDULED', true),
        countOf('CLIENT_CONFIRMED'),
        countOf('CLIENT_CONFIRMED', true),
        base()
          .andWhere('lead.leadType = :type', { type: 'MEETING_SCHEDULED' })
          .andWhere('lead.meetingDate >= CURRENT_DATE')
          .andWhere("lead.meetingDate <= CURRENT_DATE + INTERVAL '7 days'")
          .andWhere('lead.status NOT IN (:...settled)', {
            settled: ['DONE', 'CANCELLED'],
          })
          .getCount(),
      ]);

    return { meetings, meetingsNew, clients, clientsNew, upcomingThisWeek };
  }

  /**
   * Move a lead along its own ladder.
   *
   * The two types share only NEW, so the status is checked against the
   * vocabulary that belongs to this row — otherwise a booked demo could be
   * marked LIVE, which reads as a closed sale that never happened.
   */
  async updateStatus(
    id: string,
    status: KnodeLeadStatus,
    note: string | undefined,
    actor: string | null,
    siteCode: number,
  ): Promise<KnodeLead> {
    const lead = await this.assertExists(id, siteCode);
    const allowed = statusesFor(lead.leadType);

    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `"${status}" is not a status a ${
          lead.leadType === 'MEETING_SCHEDULED'
            ? 'scheduled meeting'
            : 'confirmed client'
        } can hold. Allowed: ${allowed.join(', ')}.`,
      );
    }

    if (lead.status === status) {
      return lead;
    }

    const previous = lead.status;
    await this.leadRepo.update({ id }, { status });

    await this.eventRepo.save(
      this.eventRepo.create({
        leadId: id,
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
    assignedTo: string | null | undefined,
    actor: string | null,
    siteCode: number,
  ): Promise<KnodeLead> {
    const lead = await this.assertExists(id, siteCode);
    const next = assignedTo?.trim().toLowerCase() || null;

    await this.leadRepo.update({ id }, { assignedTo: next });

    await this.eventRepo.save(
      this.eventRepo.create({
        leadId: id,
        eventType: 'ASSIGNED',
        actor,
        note: null,
        metadata: { from: lead.assignedTo, to: next },
      }),
    );

    return this.assertExists(id, siteCode);
  }

  async addNote(
    id: string,
    note: string,
    actor: string | null,
    siteCode: number,
  ): Promise<KnodeLeadEvent> {
    await this.assertExists(id, siteCode);

    return this.eventRepo.save(
      this.eventRepo.create({
        leadId: id,
        eventType: 'NOTE_ADDED',
        actor,
        note,
        metadata: null,
      }),
    );
  }

  /**
   * Site-scoped existence check.
   *
   * Every admin path goes through this, so a lead from another brand is a 404
   * rather than a row somebody else can edit.
   */
  private async assertExists(id: string, siteCode: number): Promise<KnodeLead> {
    const lead = await this.leadRepo.findOne({
      where: { id, siteCode, isDeleted: false },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }
}
