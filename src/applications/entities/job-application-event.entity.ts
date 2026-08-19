import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JobApplication } from './job-application.entity';

export const APPLICATION_EVENT_TYPES = [
  'CREATED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'NOTE_ADDED',
  'RESUME_VIEWED',
  'WITHDRAWN',
  'NOTIFICATION_SENT',
] as const;

export type ApplicationEventType = (typeof APPLICATION_EVENT_TYPES)[number];

/**
 * Append-only timeline for an application.
 *
 * `RESUME_VIEWED` is the counterpart to `MESSAGE_VIEWED` on contact enquiries:
 * a CV is the most sensitive thing a candidate hands over, so every download
 * link issued for one is recorded against the person who asked for it.
 *
 * `WITHDRAWN` survives the résumé it refers to — the file is deleted on
 * withdrawal, but the fact that an application existed and was withdrawn is
 * what lets you answer a later "did you delete my data?" honestly.
 */
@Entity({ name: 'job_application_events' })
export class JobApplicationEvent {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_job_application_events_id_pk',
  })
  id: string;

  @Index('idx_job_application_events_application_id')
  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => JobApplication, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'application_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_job_application_events_application_id_fk',
  })
  application?: JobApplication;

  @Column({ name: 'event_type', type: 'varchar', length: 30 })
  eventType: ApplicationEventType;

  /** The signed-in admin's email, or null when the candidate or system acted. */
  @Column({ name: 'actor', type: 'varchar', length: 150, nullable: true })
  actor: string | null;

  @Column({ name: 'note', type: 'varchar', length: 2000, nullable: true })
  note: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
