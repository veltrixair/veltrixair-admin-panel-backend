import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KnodeLead } from './knode-lead.entity';

export const KNODE_LEAD_EVENT_TYPES = [
  'CREATED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'NOTE_ADDED',
] as const;

export type KnodeLeadEventType = (typeof KNODE_LEAD_EVENT_TYPES)[number];

/**
 * Append-only timeline for a lead.
 *
 * `CREATED` records how the row arrived — its metadata carries whether it came
 * in live or off an offline queue, which is the difference between "saved two
 * minutes ago" and "saved on Tuesday and only reached us now".
 */
@Entity({ name: 'knode_lead_events' })
export class KnodeLeadEvent {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_knode_lead_events_id_pk',
  })
  id: string;

  @Index('idx_knode_lead_events_lead_id')
  @Column({ name: 'lead_id', type: 'uuid' })
  leadId: string;

  @ManyToOne(() => KnodeLead, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'lead_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_knode_lead_events_lead_id_fk',
  })
  lead?: KnodeLead;

  @Column({ name: 'event_type', type: 'varchar', length: 30 })
  eventType: KnodeLeadEventType;

  /** The signed-in admin's email, or null for events the system raised itself. */
  @Column({ name: 'actor', type: 'varchar', length: 150, nullable: true })
  actor: string | null;

  @Column({ name: 'note', type: 'varchar', length: 2000, nullable: true })
  note: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
