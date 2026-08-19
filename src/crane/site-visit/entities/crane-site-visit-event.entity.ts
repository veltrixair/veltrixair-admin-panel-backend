import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CraneSiteVisit } from './crane-site-visit.entity';

export const VISIT_EVENT_TYPES = [
  'CREATED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'SCHEDULED',
  'NOTE_ADDED',
  'NOTIFICATION_SENT',
] as const;

export type VisitEventType = (typeof VISIT_EVENT_TYPES)[number];

/**
 * Append-only timeline for a site visit request.
 *
 * `SCHEDULED` is separate from `STATUS_CHANGED` because a confirmed date is
 * the thing a customer will later ask about — "when did you say you were
 * coming?" is easier to answer from its own event than from a status diff.
 */
@Entity({ name: 'crane_site_visit_events' })
export class CraneSiteVisitEvent {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_site_visit_events_id_pk',
  })
  id: string;

  @Index('idx_crane_site_visit_events_visit_id')
  @Column({ name: 'visit_id', type: 'uuid' })
  visitId: string;

  @ManyToOne(() => CraneSiteVisit, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'visit_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_crane_site_visit_events_visit_id_fk',
  })
  visit?: CraneSiteVisit;

  @Column({ name: 'event_type', type: 'varchar', length: 30 })
  eventType: VisitEventType;

  /** The signed-in admin's email, or null when the customer or system acted. */
  @Column({ name: 'actor', type: 'varchar', length: 150, nullable: true })
  actor: string | null;

  @Column({ name: 'note', type: 'varchar', length: 2000, nullable: true })
  note: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
