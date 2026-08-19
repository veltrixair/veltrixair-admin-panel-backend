import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CraneApplication } from './crane-application.entity';

export const CRANE_APPLICATION_EVENT_TYPES = [
  'CREATED',
  'ACKNOWLEDGED',
  'STAGE_CHANGED',
  'CV_ATTACHED',
  'ASSIGNED',
  'UNASSIGNED',
  'NOTE_ADDED',
  'WITHDRAWN',
  'NOTIFICATION_SENT',
] as const;

export type CraneApplicationEventType =
  (typeof CRANE_APPLICATION_EVENT_TYPES)[number];

/**
 * Append-only trail for one application.
 *
 * `actor` is null for anything the system did unprompted — the submission, the
 * acknowledgement, notifications — so "nobody did this" and "we do not know
 * who did this" stay distinguishable.
 */
@Entity({ name: 'crane_application_events' })
export class CraneApplicationEvent {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_application_events_id_pk',
  })
  id: string;

  @Index('idx_crane_application_events_app')
  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => CraneApplication, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'application_id',
    foreignKeyConstraintName: 'vtx_crane_application_events_application_id_fk',
  })
  application?: CraneApplication;

  @Column({ name: 'event_type', type: 'varchar', length: 30 })
  eventType: CraneApplicationEventType;

  @Column({ name: 'actor', type: 'varchar', length: 150, nullable: true })
  actor: string | null;

  @Column({ name: 'note', type: 'varchar', length: 2000, nullable: true })
  note: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
