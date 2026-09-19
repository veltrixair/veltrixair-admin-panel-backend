import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KnodeDemoRequest } from './knode-demo-request.entity';

export const KNODE_DEMO_EVENT_TYPES = [
  'CREATED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'NOTE_ADDED',
  'NOTIFIED',
] as const;

export type KnodeDemoEventType = (typeof KNODE_DEMO_EVENT_TYPES)[number];

/**
 * Append-only timeline for a request.
 *
 * `NOTIFIED` is the notify path's only event, and it exists so a waiting list
 * still has an audit trail — who told them, when, and which module had just
 * shipped. Without it, "we emailed everyone waiting for Pharmacy" would be a
 * claim rather than a record.
 */
@Entity({ name: 'knode_demo_request_events' })
export class KnodeDemoRequestEvent {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_knode_demo_request_events_id_pk',
  })
  id: string;

  @Index('idx_knode_demo_request_events_request_id')
  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @ManyToOne(() => KnodeDemoRequest, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'request_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_knode_demo_request_events_request_id_fk',
  })
  request?: KnodeDemoRequest;

  @Column({ name: 'event_type', type: 'varchar', length: 30 })
  eventType: KnodeDemoEventType;

  /** The signed-in admin's email, or null for events the system raised. */
  @Column({ name: 'actor', type: 'varchar', length: 150, nullable: true })
  actor: string | null;

  @Column({ name: 'note', type: 'varchar', length: 2000, nullable: true })
  note: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
