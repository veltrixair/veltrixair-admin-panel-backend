import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ContactEnquiry } from './contact-enquiry.entity';

export const ENQUIRY_EVENT_TYPES = [
  'CREATED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'NOTE_ADDED',
  'MESSAGE_VIEWED',
  'NOTIFICATION_SENT',
] as const;

export type EnquiryEventType = (typeof ENQUIRY_EVENT_TYPES)[number];

/**
 * Append-only timeline for an enquiry.
 *
 * `MESSAGE_VIEWED` exists specifically for NDA-flagged enquiries: when someone
 * reads a message the submitter marked confidential, that read is recorded.
 */
@Entity({ name: 'contact_enquiry_events' })
export class ContactEnquiryEvent {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_contact_enquiry_events_id_pk',
  })
  id: string;

  @Index('idx_contact_enquiry_events_enquiry_id')
  @Column({ name: 'enquiry_id', type: 'uuid' })
  enquiryId: string;

  @ManyToOne(() => ContactEnquiry, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'enquiry_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_contact_enquiry_events_enquiry_id_fk',
  })
  enquiry?: ContactEnquiry;

  @Column({ name: 'event_type', type: 'varchar', length: 30 })
  eventType: EnquiryEventType;

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
