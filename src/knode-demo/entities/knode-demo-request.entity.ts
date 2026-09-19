import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { KnodeBedBandMaster } from '../../master-data/entities/knode-bed-band-master.entity';
import { KnodeCallWindowMaster } from '../../master-data/entities/knode-call-window-master.entity';
import { KnodeContactRoleMaster } from '../../master-data/entities/knode-contact-role-master.entity';
import { KnodeFacilityTypeMaster } from '../../master-data/entities/knode-facility-type-master.entity';
import { KnodeOpdBandMaster } from '../../master-data/entities/knode-opd-band-master.entity';
import { KnodeDemoRequestModule } from './knode-demo-request-module.entity';

/**
 * Which of the two things they asked for.
 *
 * The website shows one form with one submit button, and `intent` is set by
 * which modules were picked: a live module can be demonstrated, one that has
 * not shipped can only be waited for.
 */
export const KNODE_DEMO_INTENTS = ['DEMO', 'NOTIFY'] as const;

export type KnodeDemoIntent = (typeof KNODE_DEMO_INTENTS)[number];

/**
 * Where a demo request travels. NOTIFY rows never hold any of these.
 */
export const KNODE_DEMO_STATUSES = [
  'NEW',
  'CONTACTED',
  'DEMO_SCHEDULED',
  'DEMO_DONE',
  'WON',
  'LOST',
] as const;

export type KnodeDemoStatus = (typeof KNODE_DEMO_STATUSES)[number];

/**
 * A "Book a demo" submission from knode.veltrixair.com.
 *
 * THE ONE THING THAT SHAPES THIS TABLE
 *
 * A demo request is a pipeline: somebody wants to see the software, so it is
 * contacted, scheduled, shown, and won or lost. A notify request is not. It is
 * a waiting list — one fact, "have we told them yet" — and giving it stages
 * would invent work that does not exist.
 *
 * So the two use different columns and neither borrows the other's:
 *
 *   DEMO    `status` moves along the ladder. `notified_at` stays null.
 *   NOTIFY  `notified_at` is null while they wait, stamped when told.
 *           `status` stays null, because there is nothing to track.
 *
 * A CHECK enforces that pairing, so a client bypassing the API cannot write a
 * notify row with a pipeline stage on it.
 */
@Entity({ name: 'knode_demo_requests' })
@Unique('vtx_knode_demo_requests_reference_no_unique', ['referenceNo'])
export class KnodeDemoRequest {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_knode_demo_requests_id_pk',
  })
  id: string;

  /** kNODE is an IT-unit product. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  /** "KND-DMO-2026-0001" for a demo, "KND-NTF-2026-0001" for a waiting-list place. */
  @Column({ name: 'reference_no', type: 'varchar', length: 30 })
  referenceNo: string;

  /**
   * The radio the visitor actually chose — "Live demo" or "Notify me".
   *
   * Always equal to `intent` below, and a CHECK constraint holds it there: the
   * server no longer overrides the choice for any reason. The column is kept
   * rather than dropped so the distinction between "what was asked for" and
   * "what it became" survives if the two are ever allowed to differ again —
   * dropping it would make that a schema change instead of a one-line one.
   */
  @Column({ name: 'requested_intent', type: 'varchar', length: 10 })
  requestedIntent: KnodeDemoIntent;

  /** Which list the row lives in, and what the lifecycle columns below follow. */
  @Index('idx_knode_demo_requests_intent')
  @Column({ name: 'intent', type: 'varchar', length: 10 })
  intent: KnodeDemoIntent;

  // --- the facility -------------------------------------------------------

  @Index('idx_knode_demo_requests_facility_name')
  @Column({ name: 'facility_name', type: 'varchar', length: 200 })
  facilityName: string;

  @Column({ name: 'facility_type_code', type: 'int' })
  facilityTypeCode: number;

  @ManyToOne(() => KnodeFacilityTypeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'facility_type_code',
    referencedColumnName: 'facilityTypeCode',
    foreignKeyConstraintName: 'vtx_knode_demo_requests_facility_type_code_fk',
  })
  facilityType?: KnodeFacilityTypeMaster;

  @Column({ name: 'bed_band_code', type: 'int' })
  bedBandCode: number;

  @ManyToOne(() => KnodeBedBandMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'bed_band_code',
    referencedColumnName: 'bedBandCode',
    foreignKeyConstraintName: 'vtx_knode_demo_requests_bed_band_code_fk',
  })
  bedBand?: KnodeBedBandMaster;

  /** Optional on the form, so optional here. */
  @Column({ name: 'opd_band_code', type: 'int', nullable: true })
  opdBandCode: number | null;

  @ManyToOne(() => KnodeOpdBandMaster, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({
    name: 'opd_band_code',
    referencedColumnName: 'opdBandCode',
    foreignKeyConstraintName: 'vtx_knode_demo_requests_opd_band_code_fk',
  })
  opdBand?: KnodeOpdBandMaster;

  /**
   * Free text, not a master. India has thousands of towns with hospitals in
   * them, and a dropdown that cannot list Muzaffarpur is worse than a box.
   */
  @Index('idx_knode_demo_requests_city')
  @Column({ name: 'city', type: 'varchar', length: 120 })
  city: string;

  // --- the person ---------------------------------------------------------

  @Column({ name: 'contact_person', type: 'varchar', length: 150 })
  contactPerson: string;

  @Column({ name: 'contact_role_code', type: 'int', nullable: true })
  contactRoleCode: number | null;

  @ManyToOne(() => KnodeContactRoleMaster, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({
    name: 'contact_role_code',
    referencedColumnName: 'contactRoleCode',
    foreignKeyConstraintName: 'vtx_knode_demo_requests_contact_role_code_fk',
  })
  contactRole?: KnodeContactRoleMaster;

  /**
   * Withheld from the list, like every other personal number in this codebase.
   * A list is glanced at by anyone holding the feature; a mobile belongs on
   * the record you deliberately opened.
   */
  @Column({ name: 'phone', type: 'varchar', length: 20, select: false })
  phone: string;

  @Index('idx_knode_demo_requests_email')
  @Column({ name: 'email', type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'call_window_code', type: 'int', nullable: true })
  callWindowCode: number | null;

  @ManyToOne(() => KnodeCallWindowMaster, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({
    name: 'call_window_code',
    referencedColumnName: 'callWindowCode',
    foreignKeyConstraintName: 'vtx_knode_demo_requests_call_window_code_fk',
  })
  callWindow?: KnodeCallWindowMaster;

  /** What they typed in the open box. Withheld from the list — it is the
   *  substance of the enquiry, not a summary field. */
  @Column({
    name: 'notes',
    type: 'varchar',
    length: 2000,
    nullable: true,
    select: false,
  })
  notes: string | null;

  // --- what they asked about ----------------------------------------------

  @OneToMany(() => KnodeDemoRequestModule, (m) => m.request)
  modules?: KnodeDemoRequestModule[];

  // --- lifecycle ----------------------------------------------------------

  /** A ladder, and only for DEMO. Null on a notify row. */
  @Index('idx_knode_demo_requests_status')
  @Column({ name: 'status', type: 'varchar', length: 20, nullable: true })
  status: KnodeDemoStatus | null;

  /**
   * The whole of a notify row's lifecycle. Null means still waiting; a
   * timestamp means the module shipped and they were told.
   */
  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;

  @Column({ name: 'assigned_to', type: 'varchar', length: 150, nullable: true })
  assignedTo: string | null;

  // --- consent ------------------------------------------------------------

  /**
   * Nullable, and that is a compromise rather than a design.
   *
   * Every other public form here records consent before it records anything
   * else. The kNODE site has no consent checkbox today, so demanding one would
   * reject every real submission. The columns exist so the moment the site
   * adds the box, nothing here has to change.
   */
  @Column({ name: 'consent_at', type: 'timestamptz', nullable: true })
  consentAt: Date | null;

  @Column({
    name: 'privacy_notice_version',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  privacyNoticeVersion: string | null;

  // --- provenance ---------------------------------------------------------

  @Column({
    name: 'source_page',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  sourcePage: string | null;

  /** HMAC of the submitter's IP — never the raw address. */
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

  // --- housekeeping -------------------------------------------------------

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Index('idx_knode_demo_requests_created_date')
  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
