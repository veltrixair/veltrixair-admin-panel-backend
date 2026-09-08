import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PERMISSION } from '../auth/permissions.constants';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import {
  Notification,
  type NotificationCategory,
} from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';
import { ListNotificationsDto } from './dto/notification.dto';

/** What a caller supplies to raise one. */
export interface RaiseNotification {
  siteCode: number;
  featureCode: number;
  category: NotificationCategory;
  lead: string;
  body: string;
  link: string;
  sourceType: string;
  sourceId?: string | null;
  /** Set for anything an administrator did, so they are not told about it. */
  actorAdminId?: string | null;
}

export interface NotificationRow {
  id: string;
  category: NotificationCategory;
  lead: string;
  body: string;
  link: string;
  unread: boolean;
  createdDate: Date;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationRead)
    private readonly readRepo: Repository<NotificationRead>,
  ) {}

  /**
   * Record that something happened.
   *
   * Never throws to its caller. A notification is a side effect of the work,
   * not the work — a contact enquiry that was saved must not be reported as
   * failed because the bell could not be rung. Failures are logged and
   * swallowed deliberately.
   */
  async raise(input: RaiseNotification): Promise<void> {
    try {
      await this.notificationRepo.save(
        this.notificationRepo.create({
          siteCode: input.siteCode,
          featureCode: input.featureCode,
          category: input.category,
          lead: input.lead.slice(0, 150),
          body: input.body.slice(0, 400),
          link: input.link,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          actorAdminId: input.actorAdminId ?? null,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Could not raise "${input.lead}" on site ${input.siteCode}: ` +
          `${(error as Error).message}`,
      );
    }
  }

  /**
   * The feed, as one reader sees it.
   *
   * Visibility is two conditions, and both are the reader's *current* session
   * rather than anything stored on the row: the dashboard they are signed in
   * to, and whether the role they signed in as can VIEW the feature the
   * notification belongs to. It is the same pair the permissions guard checks
   * before letting them open the record itself, so the bell can never announce
   * something the reader would be refused.
   *
   * The EXISTS against role_permissions is deliberate — resolving the role's
   * features in JavaScript first would mean a second round trip and an IN list
   * that grows with every feature added.
   */
  private visible(roleCode: number, siteCode: number, adminId: string) {
    return (
      this.notificationRepo
        .createQueryBuilder('n')
        .where('n.siteCode = :siteCode', { siteCode })
        .andWhere(
          `EXISTS (
           SELECT 1 FROM effective_role_permissions rp
           WHERE rp.site_code = :siteCode
             AND rp.role_code = :roleCode
             AND rp.feature_code = n.feature_code
             AND rp.permission_code = :view
         )`,
          { roleCode, view: PERMISSION.VIEW },
        )
        /*
         * And not your own doing. Granting access, changing a role and
         * deactivating an account are all announced, but the person who did
         * them already knows — telling them is the noise that teaches people
         * to stop reading the bell.
         */
        .andWhere(
          '(n.actor_admin_id IS NULL OR n.actor_admin_id <> :actorSelf)',
          { actorSelf: adminId },
        )
    );
  }

  async list(
    query: ListNotificationsDto,
    adminId: string,
    siteCode: number,
    roleCode: number,
  ): Promise<PaginatedResult<NotificationRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.visible(roleCode, siteCode, adminId)
      // Read state joins in rather than filtering: an already-read item stays
      // in the list, it simply stops being marked.
      .leftJoin(
        NotificationRead,
        'r',
        'r.notification_id = n.id AND r.admin_id = :adminId',
        { adminId },
      )
      .addSelect('r.read_at', 'read_at');

    if (query.category) {
      qb.andWhere('n.category = :category', { category: query.category });
    }
    if (query.unreadOnly) {
      qb.andWhere('r.notification_id IS NULL');
    }

    const total = await qb.getCount();

    const rows = await qb
      .orderBy('n.created_date', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawAndEntities();

    const items = rows.entities.map((n, i) => ({
      id: n.id,
      category: n.category,
      lead: n.lead,
      body: n.body,
      link: n.link,
      unread: rows.raw[i]?.read_at == null,
      createdDate: n.createdDate,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** What the sidebar badge asks for, and nothing more. */
  async unreadCount(
    adminId: string,
    siteCode: number,
    roleCode: number,
  ): Promise<{ unread: number }> {
    const unread = await this.visible(roleCode, siteCode, adminId)
      .leftJoin(
        NotificationRead,
        'r',
        'r.notification_id = n.id AND r.admin_id = :adminId',
        { adminId },
      )
      .andWhere('r.notification_id IS NULL')
      .getCount();

    return { unread };
  }

  /**
   * Mark one read.
   *
   * `orIgnore` because reading twice is not an error — a double-click, or two
   * tabs open on the same feed, should be a no-op rather than a 409.
   *
   * Guarded by the same visibility rule as reading: marking something read is
   * a claim about a row you can see, and letting an id alone be enough would
   * let anyone probe which notifications exist.
   */
  async markRead(
    id: string,
    adminId: string,
    siteCode: number,
    roleCode: number,
  ): Promise<{ marked: number }> {
    const found = await this.visible(roleCode, siteCode, adminId)
      .andWhere('n.id = :id', { id })
      .getCount();
    if (!found) return { marked: 0 };

    await this.readRepo
      .createQueryBuilder()
      .insert()
      .into(NotificationRead)
      .values({ notificationId: id, adminId })
      .orIgnore()
      .execute();

    return { marked: 1 };
  }

  /**
   * Mark everything currently visible as read.
   *
   * One INSERT … SELECT rather than a read followed by a loop: the set is
   * defined by the same query that renders the feed, and doing it in the
   * database means nothing can arrive between deciding and writing.
   */
  async markAllRead(
    adminId: string,
    siteCode: number,
    roleCode: number,
  ): Promise<{ marked: number }> {
    /*
     * RETURNING, so the count comes from rows that actually landed.
     *
     * The obvious alternative — reading an affected-rows number off the
     * driver's result — does not survive TypeORM's `query()`, which hands
     * back a plain array for a Postgres INSERT and leaves nothing to read the
     * count from. That silently reported "nothing was unread" every time,
     * however many rows it had just written. Rows returned cannot lie:
     * ON CONFLICT DO NOTHING omits the ones already read.
     */
    const inserted: unknown[] = await this.notificationRepo.query(
      `INSERT INTO "notification_reads" ("notification_id", "admin_id")
       SELECT n."id", $1 FROM "notifications" n
       WHERE n."site_code" = $2
         AND EXISTS (
           SELECT 1 FROM "effective_role_permissions" rp
           WHERE rp."site_code" = $2
             AND rp."role_code" = $3
             AND rp."feature_code" = n."feature_code"
             AND rp."permission_code" = $4
         )
         -- The same exclusion the feed applies. Without it this would write
         -- read receipts for rows the caller was never shown.
         AND (n."actor_admin_id" IS NULL OR n."actor_admin_id" <> $1)
       ON CONFLICT DO NOTHING
       RETURNING "notification_id"`,
      [adminId, siteCode, roleCode, PERMISSION.VIEW],
    );

    return { marked: Array.isArray(inserted) ? inserted.length : 0 };
  }
}
