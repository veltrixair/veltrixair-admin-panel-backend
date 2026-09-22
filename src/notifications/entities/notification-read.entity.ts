import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * One person has read one notification.
 *
 * Absence is the unread state, which keeps the common case free of rows —
 * nothing is written until somebody actually reads something. The alternative,
 * a row per (notification, admin) created up front, would mean writing a row
 * for every administrator every time anything happened, most of them never
 * touched again.
 */
@Entity({ name: 'notification_reads' })
@Index('IDX_notification_reads_admin', ['adminId'])
export class NotificationRead {
  @PrimaryColumn({ name: 'notification_id', type: 'uuid' })
  notificationId: string;

  @PrimaryColumn({ name: 'admin_id', type: 'uuid' })
  adminId: string;

  @Column({ name: 'read_at', type: 'timestamptz', default: () => 'now()' })
  readAt: Date;
}
