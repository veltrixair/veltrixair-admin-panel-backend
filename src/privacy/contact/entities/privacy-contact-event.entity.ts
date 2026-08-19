import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PrivacyContactEnquiry } from './privacy-contact-enquiry.entity';

export const PRIVACY_CONTACT_EVENT_TYPES = [
  'CREATED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'UNASSIGNED',
  'NOTE_ADDED',
  'NOTIFICATION_SENT',
] as const;

export type PrivacyContactEventType =
  (typeof PRIVACY_CONTACT_EVENT_TYPES)[number];

/**
 * Append-only trail for one enquiry.
 *
 * `actor` is null for anything the system did on its own — the submission
 * itself, and notifications — so "nobody" and "we do not know who" stay
 * distinguishable in the record.
 */
@Entity({ name: 'privacy_contact_events' })
export class PrivacyContactEvent {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_privacy_contact_events_id_pk',
  })
  id: string;

  @Index('idx_privacy_contact_events_enquiry')
  @Column({ name: 'enquiry_id', type: 'uuid' })
  enquiryId: string;

  @ManyToOne(() => PrivacyContactEnquiry, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'enquiry_id',
    foreignKeyConstraintName: 'vtx_privacy_contact_events_enquiry_id_fk',
  })
  enquiry?: PrivacyContactEnquiry;

  @Column({ name: 'event_type', type: 'varchar', length: 30 })
  eventType: PrivacyContactEventType;

  /** The admin's email, or null when the system acted. */
  @Column({ name: 'actor', type: 'varchar', length: 150, nullable: true })
  actor: string | null;

  @Column({ name: 'note', type: 'varchar', length: 2000, nullable: true })
  note: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
