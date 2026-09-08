import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * The filter chips on the notifications screen.
 *
 * A presentation grouping, not a permission one — IT and Privacy enquiries are
 * different features that both belong under "Contact us". Which is why this is
 * stored alongside `featureCode` rather than derived from it.
 */
export const NOTIFICATION_CATEGORIES = [
  'contact',
  'jobs',
  'architect',
  'insights',
  'system',
  /** Crane: a request for a quotation. */
  'quotes',
  /** Crane: a request for an engineer to visit a site. */
  'visits',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * One thing that happened, on one dashboard.
 *
 * Not one per recipient. Who may read it is answered when it is read, from
 * `siteCode` and `featureCode` against the reader's current session — so a
 * role granted today reveals the whole history it covers, and a role revoked
 * today hides it, without anything being rewritten.
 */
@Entity({ name: 'notifications' })
@Index('IDX_notifications_feed', ['siteCode', 'featureCode', 'createdDate'])
export class Notification {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_notifications_id_pk',
  })
  id: string;

  /** The dashboard it belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  /**
   * The feature a reader must be able to VIEW.
   *
   * A notification quotes a customer's name and their enquiry, so it is
   * governed exactly as tightly as the record it points at.
   */
  @Column({ name: 'feature_code', type: 'int' })
  featureCode: number;

  @Column({ name: 'category', type: 'varchar', length: 20 })
  category: NotificationCategory;

  /** Shown bold, ahead of the body. */
  @Column({ name: 'lead', type: 'varchar', length: 150 })
  lead: string;

  @Column({ name: 'body', type: 'varchar', length: 400 })
  body: string;

  /** A path, never a full URL — one bundle serves three hostnames. */
  @Column({ name: 'link', type: 'varchar', length: 300 })
  link: string;

  @Column({ name: 'source_type', type: 'varchar', length: 40 })
  sourceType: string;

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  /**
   * The administrator who caused it, when one did.
   *
   * Used to keep people from being told about their own actions. Null for
   * anything arriving from the public site, where nobody inside the company
   * caused it — those stay visible to everyone entitled to them.
   */
  @Column({ name: 'actor_admin_id', type: 'uuid', nullable: true })
  actorAdminId: string | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
