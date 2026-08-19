import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CraneQuoteRequest } from './crane-quote-request.entity';

export const QUOTE_EVENT_TYPES = [
  'CREATED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'NOTE_ADDED',
  'ATTACHMENT_VIEWED',
  'NOTIFICATION_SENT',
  'ESCALATED',
] as const;

export type QuoteEventType = (typeof QUOTE_EVENT_TYPES)[number];

/**
 * Append-only timeline for a quote request.
 *
 * `ESCALATED` is what a P1 writes on arrival — a production stop is recorded
 * as an escalation the moment it lands, so the trail shows the alert was
 * raised even if nobody has touched the record yet.
 */
@Entity({ name: 'crane_quote_events' })
export class CraneQuoteEvent {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_quote_events_id_pk',
  })
  id: string;

  @Index('idx_crane_quote_events_quote_id')
  @Column({ name: 'quote_id', type: 'uuid' })
  quoteId: string;

  @ManyToOne(() => CraneQuoteRequest, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'quote_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_crane_quote_events_quote_id_fk',
  })
  quote?: CraneQuoteRequest;

  @Column({ name: 'event_type', type: 'varchar', length: 30 })
  eventType: QuoteEventType;

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
