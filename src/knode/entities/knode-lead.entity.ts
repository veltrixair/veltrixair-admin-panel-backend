import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Which button the rep pressed on the deck's last slide.
 *
 * Stored on one table rather than split across two, because the fields overlap
 * almost entirely — the difference is a meeting date and a status vocabulary,
 * not a different kind of thing.
 */
export const KNODE_LEAD_TYPES = [
  'MEETING_SCHEDULED',
  'CLIENT_CONFIRMED',
] as const;

export type KnodeLeadType = (typeof KNODE_LEAD_TYPES)[number];

/** Where a booked demo can go. */
export const KNODE_MEETING_STATUSES = [
  'NEW',
  'REMINDER_SENT',
  'DEMO_DONE',
  'RESCHEDULED',
  'DONE',
  'CANCELLED',
] as const;

/** Where a confirmed client can go. A different journey entirely. */
export const KNODE_CLIENT_STATUSES = [
  'NEW',
  'ONBOARDING_STARTED',
  'PAPERWORK_DONE',
  'GO_LIVE_PLANNED',
  'LIVE',
  'DROPPED',
] as const;

export const KNODE_LEAD_STATUSES = [
  ...new Set([...KNODE_MEETING_STATUSES, ...KNODE_CLIENT_STATUSES]),
] as const;

export type KnodeMeetingStatus = (typeof KNODE_MEETING_STATUSES)[number];
export type KnodeClientStatus = (typeof KNODE_CLIENT_STATUSES)[number];
export type KnodeLeadStatus = KnodeMeetingStatus | KnodeClientStatus;

/** The statuses legal for a given type. Only NEW is shared. */
export const statusesFor = (type: KnodeLeadType): readonly KnodeLeadStatus[] =>
  type === 'MEETING_SCHEDULED' ? KNODE_MEETING_STATUSES : KNODE_CLIENT_STATUSES;

/**
 * A lead captured on the last slide of the Knode HMS product deck.
 *
 * Unlike every other submission in this codebase, these do not come from a
 * website. The deck is a sales tool carried into hospital meeting rooms, and a
 * lead is typed while sitting with the director. It is posted and stored as it
 * is saved — there is no queue.
 *
 * Two columns still earn their place from where the deck is used:
 *
 *   `client_key` is unique and supplied by the deck. With no queue to replay
 *   it guards a narrower case, but a real one: a rep on bad hospital wifi
 *   pressing save twice must not produce two leads.
 *
 *   `saved_at` is the rep's own clock at the moment of saving, kept separate
 *   from `created_date` because a retry seconds or minutes later should not
 *   move when the conversation actually happened.
 */
@Entity({ name: 'knode_leads' })
@Unique('vtx_knode_leads_reference_no_unique', ['referenceNo'])
@Unique('vtx_knode_leads_client_key_unique', ['clientKey'])
export class KnodeLead {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_knode_leads_id_pk',
  })
  id: string;

  /** Always the IT unit — Knode is an IT-unit product. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  /** e.g. "KND-MTG-2026-0007" or "KND-CNF-2026-0004". */
  @Column({ name: 'reference_no', type: 'varchar', length: 30 })
  referenceNo: string;

  /**
   * The deck's own identifier for this record. Not shown to anyone — it exists
   * so a re-sent queue is recognised rather than re-imported.
   */
  @Column({ name: 'client_key', type: 'varchar', length: 100 })
  clientKey: string;

  @Index('idx_knode_leads_lead_type')
  @Column({ name: 'lead_type', type: 'varchar', length: 20 })
  leadType: KnodeLeadType;

  // --- Captured on the slide ---------------------------------------------

  @Index('idx_knode_leads_hospital_name')
  @Column({ name: 'hospital_name', type: 'varchar', length: 200 })
  hospitalName: string;

  @Column({ name: 'contact_person', type: 'varchar', length: 150 })
  contactPerson: string;

  @Column({ name: 'designation', type: 'varchar', length: 150, nullable: true })
  designation: string | null;

  /** The deck's primary channel — reps follow up on WhatsApp, not email. */
  @Column({ name: 'whatsapp', type: 'varchar', length: 32, select: false })
  whatsapp: string;

  /** Genuinely optional: smaller hospitals often give a number and nothing else. */
  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email: string | null;

  /** Both null on a CLIENT_CONFIRMED row — there is no meeting to hold. */
  @Column({ name: 'meeting_date', type: 'date', nullable: true })
  meetingDate: string | null;

  @Column({ name: 'meeting_time', type: 'varchar', length: 5, nullable: true })
  meetingTime: string | null;

  /**
   * What the rep wrote in the room — bed count, which modules interested them,
   * what they currently use. Withheld from the list for the same reason a
   * contact enquiry's message is: it is the substance, not a summary field.
   */
  @Column({
    name: 'notes',
    type: 'varchar',
    length: 2000,
    nullable: true,
    select: false,
  })
  notes: string | null;

  // --- Lifecycle ----------------------------------------------------------

  @Index('idx_knode_leads_status')
  @Column({ name: 'status', type: 'varchar', length: 25, default: 'NEW' })
  status: KnodeLeadStatus;

  @Column({ name: 'assigned_to', type: 'varchar', length: 150, nullable: true })
  assignedTo: string | null;

  /** When the rep pressed save on the deck. */
  @Index('idx_knode_leads_saved_at')
  @Column({ name: 'saved_at', type: 'timestamptz' })
  savedAt: Date;

  /**
   * When it reached this server.
   *
   * Vestigial now the queue is gone — with a lead posted as it is saved this
   * is `created_date` by another name. Left in place rather than dropped in a
   * second migration over a merged table; it costs a nullable timestamp, and
   * the column is the natural home for the answer again if the deck ever does
   * gain an offline mode.
   */
  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true })
  syncedAt: Date | null;

  // --- Provenance ---------------------------------------------------------

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

  // --- Housekeeping -------------------------------------------------------

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Index('idx_knode_leads_created_date')
  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
