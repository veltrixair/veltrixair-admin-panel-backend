import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ReferenceNumberService } from '../common/services/reference-number.service';
import { SpamCheckService } from '../common/services/spam-check.service';
import { FEATURE } from '../auth/permissions.constants';
import { NotificationService } from '../notifications/notification.service';
import { MasterDataService } from '../master-data/master-data.service';
import { KnodeModuleMaster } from '../master-data/entities/knode-module-master.entity';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { ListDemoRequestsDto } from './dto/list-demo-requests.dto';
import { MarkNotifiedDto } from './dto/update-demo-request.dto';
import { KnodeDemoRequestEvent } from './entities/knode-demo-request-event.entity';
import { KnodeDemoRequestModule } from './entities/knode-demo-request-module.entity';
import { KnodeDemoRequest } from './entities/knode-demo-request.entity';
import type {
  KnodeDemoIntent,
  KnodeDemoStatus,
} from './entities/knode-demo-request.entity';

const DEMO_PREFIX = 'KND-DMO';
const NOTIFY_PREFIX = 'KND-NTF';
const DEMO_SEQUENCE = 'knode_demo_ref_seq';
const NOTIFY_SEQUENCE = 'knode_notify_ref_seq';
const REFERENCE_PAD = 4;

export interface SubmissionContext {
  ip?: string;
  userAgent?: string;
}

export interface DemoRequestResult {
  referenceNo: string;
  intent: KnodeDemoIntent;
  /** What to tell the visitor. One sentence, whichever list they landed in. */
  message: string;
}

export interface KnodeDemoStats {
  demos: number;
  demosNew: number;
  waiting: number;
  /** Waiting requests whose module has since gone live — the backlog to clear. */
  waitingOnLiveModules: number;
}

export interface MarkNotifiedResult {
  moduleCode: number;
  notified: number;
}

/**
 * Columns safe to return in a list — no phone, no notes, no ipHash.
 */
const LIST_COLUMNS = [
  'request.id',
  'request.referenceNo',
  'request.requestedIntent',
  'request.intent',
  'request.facilityName',
  'request.facilityTypeCode',
  'request.bedBandCode',
  'request.opdBandCode',
  'request.city',
  'request.contactPerson',
  'request.contactRoleCode',
  'request.email',
  'request.callWindowCode',
  'request.status',
  'request.notifiedAt',
  'request.assignedTo',
  'request.spamScore',
  'request.createdDate',
];

@Injectable()
export class KnodeDemoService {
  private readonly logger = new Logger(KnodeDemoService.name);

  constructor(
    @InjectRepository(KnodeDemoRequest)
    private readonly requestRepo: Repository<KnodeDemoRequest>,
    @InjectRepository(KnodeDemoRequestEvent)
    private readonly eventRepo: Repository<KnodeDemoRequestEvent>,
    @InjectRepository(KnodeModuleMaster)
    private readonly moduleMasterRepo: Repository<KnodeModuleMaster>,
    private readonly dataSource: DataSource,
    private readonly referenceNumbers: ReferenceNumberService,
    private readonly spamCheck: SpamCheckService,
    private readonly config: ConfigService,
    // NotificationsModule is @Global, so this needs no module import.
    private readonly notifications: NotificationService,
    private readonly masterData: MasterDataService,
  ) {}

  // -----------------------------------------------------------------------
  // Public submission
  // -----------------------------------------------------------------------

  /**
   * Record a "Book a demo" submission.
   *
   * The visitor's own answer to "Live demo or Notify me" decides which of the
   * two lists the request lands in, and nothing overrides it. Module
   * availability is recorded on the timeline but routes nothing: a demo of
   * something still being built is still a demo request, and is the row worth
   * reading first rather than the row to file away.
   */
  async submit(
    dto: CreateDemoRequestDto,
    context: SubmissionContext,
    siteCode: number,
  ): Promise<DemoRequestResult> {
    /* The five bare codes, before anything is written. Modules are checked
       just below, where the rows themselves are needed. */
    await this.masterData.assertKnodeDemoCodes(
      {
        facilityTypeCode: dto.facilityTypeCode,
        bedBandCode: dto.bedBandCode,
        opdBandCode: dto.opdBandCode,
        contactRoleCode: dto.contactRoleCode,
        callWindowCode: dto.callWindowCode,
      },
      siteCode,
    );

    const modules = await this.moduleMasterRepo.find({
      where: {
        moduleCode: In(dto.moduleCodes),
        /* Scoped: the masters are per-brand, so an unscoped lookup would
           accept another site's module code as if it were ours. */
        siteCode,
        isActive: true,
        isDeleted: false,
      },
    });

    if (modules.length !== dto.moduleCodes.length) {
      const known = new Set(modules.map((m) => m.moduleCode));
      const unknown = dto.moduleCodes.filter((c) => !known.has(c));
      throw new BadRequestException(
        `Unknown module code${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`,
      );
    }

    /*
     * The visitor's own answer, taken at face value.
     *
     * The radio defaults to a demo on the website, and the short form on a
     * product page implies one, so an absent intent means DEMO.
     *
     * Nothing else is consulted. Whether the modules picked have shipped
     * decides nothing: "Live demo" lands in the demo list and "Notify me"
     * lands in the notify list, live or pending either way. An earlier version
     * downgraded a demo of unreleased modules into the waiting list, which
     * filed the person most worth talking to — somebody asking to be shown
     * something still being built — out of the list anyone was working.
     *
     * `requestedIntent` is therefore always equal to `intent`, and a CHECK
     * constraint enforces it. The pair is kept rather than collapsed so the
     * two can diverge again without a rewrite if the policy ever changes back.
     */
    const requestedIntent: KnodeDemoIntent = dto.intent ?? 'DEMO';
    const intent: KnodeDemoIntent = requestedIntent;

    const spam = await this.spamCheck.evaluate({
      honeypot: dto.honeypot,
      captchaToken: dto.captchaToken,
      email: dto.email,
      ip: context.ip,
    });

    const phone = dto.phone.replace(/\D/g, '');

    const created = await this.dataSource.transaction(async (manager) => {
      const referenceNo = await this.referenceNumbers.next(
        intent === 'DEMO' ? DEMO_PREFIX : NOTIFY_PREFIX,
        intent === 'DEMO' ? DEMO_SEQUENCE : NOTIFY_SEQUENCE,
        manager,
        REFERENCE_PAD,
      );

      const request = manager.create(KnodeDemoRequest, {
        siteCode,
        referenceNo,
        requestedIntent,
        intent,
        facilityName: dto.facilityName.trim(),
        facilityTypeCode: dto.facilityTypeCode,
        bedBandCode: dto.bedBandCode,
        opdBandCode: dto.opdBandCode ?? null,
        city: dto.city.trim(),
        contactPerson: dto.contactPerson.trim(),
        contactRoleCode: dto.contactRoleCode ?? null,
        phone,
        email: dto.email.trim().toLowerCase(),
        callWindowCode: dto.callWindowCode ?? null,
        notes: dto.notes?.trim() || null,
        // The two lifecycles never overlap: a demo starts on its ladder, a
        // notify row starts with neither a stage nor a stamp.
        status: intent === 'DEMO' ? 'NEW' : null,
        notifiedAt: null,
        consentAt: dto.consentGiven ? new Date() : null,
        privacyNoticeVersion: dto.consentGiven
          ? (dto.privacyNoticeVersion ??
            this.config.get<string>('PRIVACY_NOTICE_VERSION', 'unversioned'))
          : null,
        sourcePage: dto.sourcePage ?? null,
        ipHash: this.spamCheck.hashIp(context.ip),
        userAgent: context.userAgent ?? null,
        spamScore: spam.score,
      });

      const saved = await manager.save(request);

      await manager.save(
        modules.map((m) =>
          manager.create(KnodeDemoRequestModule, {
            requestId: saved.id,
            moduleCode: m.moduleCode,
          }),
        ),
      );

      await manager.save(
        manager.create(KnodeDemoRequestEvent, {
          requestId: saved.id,
          eventType: 'CREATED',
          actor: null,
          note: null,
          metadata: {
            requestedIntent,
            intent,
            modules: modules.map((m) => m.moduleName),
            // Routes nothing now. Recorded because "asked for a demo of three
            // modules, none of them shipped" is the context whoever picks the
            // row up needs before they call.
            liveModules: modules
              .filter((m) => m.isLive)
              .map((m) => m.moduleName),
            spamScore: spam.score,
            spamReasons: spam.reasons,
          },
        }),
      );

      this.logger.log(
        `kNODE ${intent} ${referenceNo} — ${dto.facilityName} (${modules.length} module${modules.length > 1 ? 's' : ''})`,
      );

      return {
        id: saved.id,
        referenceNo,
        intent,
        // One sentence whatever the intent. The DEMO / NOTIFY split is for the
        // desk — it decides the reference prefix and the stage the row starts
        // in — and the visitor is not meant to see the difference.
        message:
          'Thank you — we will connect with you shortly to arrange the walkthrough.',
      };
    });

    /*
     * Announced after the transaction, never inside it.
     *
     * A notification is a side effect of the capture, not part of it: raising
     * it within the transaction would let a failed announcement roll back a
     * submission that is otherwise perfectly saved. `raise` swallows its own
     * errors for the same reason.
     *
     * Spam is captured but not announced. The row is still written and still
     * visible on the desk, which is where a false positive gets noticed — but
     * a bell that rings for every bot trains people to ignore it.
     */
    if (!spam.isSpam) {
      await this.notifications.raise({
        siteCode,
        featureCode: FEATURE.KNODE_DEMO,
        category: 'knodeDemo',
        lead:
          created.intent === 'DEMO'
            ? 'Demo requested on the kNODE website'
            : 'Notify-me signup on the kNODE website',
        body: `${dto.facilityName.trim()} · ${dto.city.trim()} · ${dto.contactPerson.trim()}`,
        // The uuid, not the reference number: every :id in the panel is a uuid
        // pipe, so a link built from KND-DMO-… reaches the screen and then 400s.
        link: `/knode-demos/${created.id}`,
        sourceType: 'knode_demo_request',
        sourceId: created.id,
        // No actor — the website is not a signed-in administrator, so there is
        // nobody to leave out of their own notification.
      });
    }

    return {
      referenceNo: created.referenceNo,
      intent: created.intent,
      message: created.message,
    };
  }

  // -----------------------------------------------------------------------
  // Admin
  // -----------------------------------------------------------------------

  async list(
    query: ListDemoRequestsDto,
    siteCode: number,
  ): Promise<PaginatedResult<KnodeDemoRequest>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.requestRepo
      .createQueryBuilder('request')
      .select(LIST_COLUMNS)
      .where('request.isDeleted = false')
      .andWhere('request.siteCode = :siteCode', { siteCode });

    if (query.intent) {
      qb.andWhere('request.intent = :intent', { intent: query.intent });
    }
    if (query.status) {
      qb.andWhere('request.status = :status', { status: query.status });
    }
    if (query.moduleCode !== undefined) {
      // EXISTS rather than a join: a request asking about four modules must
      // appear once, not four times.
      qb.andWhere(
        `EXISTS (SELECT 1 FROM knode_demo_request_modules m
                  WHERE m.request_id = request.id AND m.module_code = :moduleCode)`,
        { moduleCode: query.moduleCode },
      );
    }
    if (query.search) {
      qb.andWhere(
        '(request.facilityName ILIKE :search OR request.contactPerson ILIKE :search' +
          ' OR request.city ILIKE :search OR request.referenceNo ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.waiting === 'true') {
      qb.andWhere('request.intent = :waitingIntent', {
        waitingIntent: 'NOTIFY',
      }).andWhere('request.notifiedAt IS NULL');
    }
    if (query.unassigned === 'true') {
      qb.andWhere('request.assignedTo IS NULL');
    }

    const [items, total] = await qb
      .orderBy('request.createdDate', 'DESC')
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

  /** Everything, including the phone, the notes and the modules asked about. */
  async findOne(id: string, siteCode: number): Promise<KnodeDemoRequest> {
    const request = await this.requestRepo
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.modules', 'rm')
      .leftJoinAndSelect('rm.module', 'module')
      .leftJoinAndSelect('request.facilityType', 'facilityType')
      .leftJoinAndSelect('request.bedBand', 'bedBand')
      .leftJoinAndSelect('request.opdBand', 'opdBand')
      .leftJoinAndSelect('request.contactRole', 'contactRole')
      .leftJoinAndSelect('request.callWindow', 'callWindow')
      .addSelect(['request.phone', 'request.notes'])
      .where('request.id = :id', { id })
      .andWhere('request.siteCode = :siteCode', { siteCode })
      .andWhere('request.isDeleted = false')
      .getOne();

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return request;
  }

  async listEvents(
    id: string,
    siteCode: number,
  ): Promise<KnodeDemoRequestEvent[]> {
    await this.assertExists(id, siteCode);

    return this.eventRepo.find({
      where: { requestId: id },
      order: { createdDate: 'DESC' },
    });
  }

  async stats(siteCode: number): Promise<KnodeDemoStats> {
    const base = () =>
      this.requestRepo
        .createQueryBuilder('request')
        .where('request.isDeleted = false')
        .andWhere('request.siteCode = :siteCode', { siteCode });

    const [demos, demosNew, waiting, waitingOnLiveModules] = await Promise.all([
      base().andWhere("request.intent = 'DEMO'").getCount(),
      base()
        .andWhere("request.intent = 'DEMO'")
        .andWhere("request.status = 'NEW'")
        .getCount(),
      base()
        .andWhere("request.intent = 'NOTIFY'")
        .andWhere('request.notifiedAt IS NULL')
        .getCount(),
      /*
       * People still waiting for something that has since shipped. This is the
       * number that should be zero, and the one nobody would notice growing:
       * a module goes live and the queue it was collecting is simply forgotten.
       */
      base()
        .andWhere("request.intent = 'NOTIFY'")
        .andWhere('request.notifiedAt IS NULL')
        .andWhere(
          `EXISTS (SELECT 1 FROM knode_demo_request_modules m
                     JOIN knode_module_masters mm ON mm.module_code = m.module_code
                    WHERE m.request_id = request.id AND mm.is_live = true)`,
        )
        .getCount(),
    ]);

    return { demos, demosNew, waiting, waitingOnLiveModules };
  }

  /**
   * Move a demo along its ladder.
   *
   * Refused outright on a notify row. A waiting list has one fact about it,
   * and it is not a stage.
   */
  async updateStatus(
    id: string,
    status: KnodeDemoStatus,
    note: string | undefined,
    actor: string | null,
    siteCode: number,
  ): Promise<KnodeDemoRequest> {
    const request = await this.assertExists(id, siteCode);

    if (request.intent !== 'DEMO') {
      throw new BadRequestException(
        'This is a notify request, not a demo. It has no pipeline — mark it ' +
          'notified when the module ships instead.',
      );
    }

    if (request.status === status) {
      return request;
    }

    const previous = request.status;
    await this.requestRepo.update({ id }, { status });

    await this.eventRepo.save(
      this.eventRepo.create({
        requestId: id,
        eventType: 'STATUS_CHANGED',
        actor,
        note: note ?? null,
        metadata: { from: previous, to: status },
      }),
    );

    return this.assertExists(id, siteCode);
  }

  /**
   * Set or clear the notified stamp on one request.
   *
   * The counterpart to `markNotified`, which is the workflow: a module ships
   * and the whole queue it collected is cleared at once. This handles the row
   * a queue cannot — emailed individually, marked in error, or bounced and
   * owed another attempt.
   *
   * Refused on a DEMO row, which has a status ladder instead. That mirrors
   * `updateStatus` refusing a notify row: each lifecycle is reachable only
   * through its own door.
   */
  async setNotified(
    id: string,
    notified: boolean,
    note: string | undefined,
    actor: string | null,
    siteCode: number,
  ): Promise<KnodeDemoRequest> {
    const request = await this.assertExists(id, siteCode);

    if (request.intent !== 'NOTIFY') {
      throw new BadRequestException(
        'This is a demo request, not a notify one. Move it along its status ' +
          'ladder instead.',
      );
    }

    /* Already in the asked-for state — nothing to write, and no event either. */
    if (Boolean(request.notifiedAt) === notified) {
      return request;
    }

    await this.requestRepo.update(
      { id },
      { notifiedAt: notified ? new Date() : null },
    );

    await this.eventRepo.save(
      this.eventRepo.create({
        requestId: id,
        eventType: 'NOTIFIED',
        actor,
        note: note ?? null,
        /*
         * The direction, not a module. A manual change has no single module
         * behind it — the bulk route records `moduleCode` because a release is
         * exactly what prompted it, and this is not that.
         */
        metadata: { notified, manual: true },
      }),
    );

    return this.assertExists(id, siteCode);
  }

  /**
   * Tell everybody waiting for a module that it has arrived.
   *
   * Bulk and keyed by module, because that is the shape of the job: a release
   * happens once and the queue it was collecting is cleared in one action.
   * Doing it row by row would be both tedious and a way to miss somebody.
   *
   * Already-notified rows are skipped rather than re-stamped, so running it
   * twice after a partial send is safe.
   */
  async markNotified(
    dto: MarkNotifiedDto,
    actor: string | null,
    siteCode: number,
  ): Promise<MarkNotifiedResult> {
    const module = await this.moduleMasterRepo.findOne({
      where: { moduleCode: dto.moduleCode, isDeleted: false },
    });

    if (!module) {
      throw new NotFoundException(`Unknown module code: ${dto.moduleCode}`);
    }

    const qb = this.requestRepo
      .createQueryBuilder('request')
      .select(['request.id'])
      .where('request.isDeleted = false')
      .andWhere('request.siteCode = :siteCode', { siteCode })
      .andWhere("request.intent = 'NOTIFY'")
      .andWhere('request.notifiedAt IS NULL')
      .andWhere(
        `EXISTS (SELECT 1 FROM knode_demo_request_modules m
                  WHERE m.request_id = request.id AND m.module_code = :moduleCode)`,
        { moduleCode: dto.moduleCode },
      );

    if (dto.requestIds?.length) {
      qb.andWhere('request.id IN (:...ids)', { ids: dto.requestIds });
    }

    const targets = await qb.getMany();

    if (targets.length === 0) {
      return { moduleCode: dto.moduleCode, notified: 0 };
    }

    const ids = targets.map((r) => r.id);
    const notifiedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.update(KnodeDemoRequest, { id: In(ids) }, { notifiedAt });

      await manager.save(
        ids.map((requestId) =>
          manager.create(KnodeDemoRequestEvent, {
            requestId,
            eventType: 'NOTIFIED',
            actor,
            note: dto.note ?? null,
            metadata: {
              moduleCode: dto.moduleCode,
              moduleName: module.moduleName,
            },
          }),
        ),
      );
    });

    this.logger.log(
      `kNODE notify — ${ids.length} told about ${module.moduleName} by ${actor ?? 'system'}`,
    );

    return { moduleCode: dto.moduleCode, notified: ids.length };
  }

  async assign(
    id: string,
    assignedTo: string | null | undefined,
    actor: string | null,
    siteCode: number,
  ): Promise<KnodeDemoRequest> {
    const request = await this.assertExists(id, siteCode);
    const next = assignedTo?.trim().toLowerCase() || null;

    await this.requestRepo.update({ id }, { assignedTo: next });

    await this.eventRepo.save(
      this.eventRepo.create({
        requestId: id,
        eventType: 'ASSIGNED',
        actor,
        note: null,
        metadata: { from: request.assignedTo, to: next },
      }),
    );

    return this.assertExists(id, siteCode);
  }

  async addNote(
    id: string,
    note: string,
    actor: string | null,
    siteCode: number,
  ): Promise<KnodeDemoRequestEvent> {
    await this.assertExists(id, siteCode);

    return this.eventRepo.save(
      this.eventRepo.create({
        requestId: id,
        eventType: 'NOTE_ADDED',
        actor,
        note,
        metadata: null,
      }),
    );
  }

  /** How many are still waiting, per module. Drives the waiting-list screen. */
  async waitingByModule(
    siteCode: number,
  ): Promise<{ moduleCode: number; moduleName: string; waiting: number }[]> {
    const rows = await this.dataSource.query<
      { module_code: number; module_name: string; waiting: string }[]
    >(
      `SELECT mm.module_code, mm.module_name, count(*)::text AS waiting
         FROM knode_demo_request_modules m
         JOIN knode_demo_requests r  ON r.id = m.request_id
         JOIN knode_module_masters mm ON mm.module_code = m.module_code
        WHERE r.is_deleted = false
          AND r.site_code = $1
          AND r.intent = 'NOTIFY'
          AND r.notified_at IS NULL
        GROUP BY mm.module_code, mm.module_name, mm.display_order
        ORDER BY mm.display_order`,
      [siteCode],
    );

    return rows.map((r) => ({
      moduleCode: r.module_code,
      moduleName: r.module_name,
      waiting: Number(r.waiting),
    }));
  }

  private async assertExists(
    id: string,
    siteCode: number,
  ): Promise<KnodeDemoRequest> {
    const request = await this.requestRepo.findOne({
      where: { id, siteCode, isDeleted: false },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return request;
  }
}
