import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Architect } from './architect.entity';
import { SessionSlot } from './session-slot.entity';

export const BOOKING_STATUSES = [
  'BOOKED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** "Deliverables within two business days" — memo, checklist, scoping table. */
export const DELIVERABLE_BUSINESS_DAYS = 2;

/**
 * A confirmed discovery session.
 *
 * `programme` and `phone`-equivalent free text are `select: false` for the same
 * reason as the contact module: a list query must ask for personal data rather
 * than receive it by omission.
 */
@Entity({ name: 'discovery_bookings' })
@Unique('vtx_discovery_bookings_reference_no_unique', ['referenceNo'])
@Unique('vtx_discovery_bookings_slot_id_unique', ['slotId'])
@Unique('vtx_discovery_bookings_manage_token_unique', ['manageToken'])
export class DiscoveryBooking {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_discovery_bookings_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  /** Shown on confirmation, e.g. "DC-2026-000042". */
  @Column({ name: 'reference_no', type: 'varchar', length: 30 })
  referenceNo: string;

  @Column({ name: 'slot_id', type: 'uuid' })
  slotId: string;

  @OneToOne(() => SessionSlot, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'slot_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_discovery_bookings_slot_id_fk',
  })
  slot?: SessionSlot;

  @Index('idx_discovery_bookings_architect_id')
  @Column({ name: 'architect_id', type: 'uuid' })
  architectId: string;

  @ManyToOne(() => Architect, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'architect_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_discovery_bookings_architect_id_fk',
  })
  architect?: Architect;

  // --- Form fields -------------------------------------------------------

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  @Column({ name: 'company', type: 'varchar', length: 150 })
  company: string;

  @Column({ name: 'role_title', type: 'varchar', length: 150 })
  roleTitle: string;

  @Index('idx_discovery_bookings_work_email')
  @Column({ name: 'work_email', type: 'varchar', length: 255 })
  workEmail: string;

  /** "What's the programme?" */
  @Column({ name: 'programme', type: 'varchar', length: 2000, select: false })
  programme: string;

  /**
   * "This conversation will involve confidential information. Please send a
   * mutual NDA before the session."
   */
  @Column({ name: 'requires_nda', type: 'boolean', default: false })
  requiresNda: boolean;

  /** The visitor's IANA timezone — the invite and emails have no browser. */
  @Column({ name: 'attendee_timezone', type: 'varchar', length: 64 })
  attendeeTimezone: string;

  // --- Consent -----------------------------------------------------------

  @Column({ name: 'consent_at', type: 'timestamptz' })
  consentAt: Date;

  @Column({ name: 'privacy_notice_version', type: 'varchar', length: 50 })
  privacyNoticeVersion: string;

  // --- Lifecycle ---------------------------------------------------------

  @Index('idx_discovery_bookings_status')
  @Column({ name: 'status', type: 'varchar', length: 15, default: 'BOOKED' })
  status: BookingStatus;

  /** Two business days after the session, on the architect's office calendar. */
  @Column({ name: 'deliverables_due_at', type: 'timestamptz' })
  deliverablesDueAt: Date;

  @Column({ name: 'invite_sent_at', type: 'timestamptz', nullable: true })
  inviteSentAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  /** Lets the attendee view or cancel without an account. */
  @Column({ name: 'manage_token', type: 'varchar', length: 64 })
  manageToken: string;

  // --- Provenance --------------------------------------------------------

  @Column({ name: 'source_page', type: 'varchar', length: 500, nullable: true })
  sourcePage: string | null;

  @Column({
    name: 'ip_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
    select: false,
  })
  ipHash: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ name: 'spam_score', type: 'int', default: 0 })
  spamScore: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
