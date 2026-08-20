import {
  Column,
  CreateDateColumn,
  JoinTable,
  ManyToMany,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { StoredFile } from '../../../files/entities/stored-file.entity';
import { CraneJobPosting } from '../../careers/entities/crane-job-posting.entity';
import { CraneAvailabilityMaster } from '../../masters/entities/crane-availability-master.entity';
import { CraneCareerQualificationMaster } from '../../masters/entities/crane-career-qualification-master.entity';
import { CraneCareerTrackMaster } from '../../masters/entities/crane-career-track-master.entity';
import { CraneExperienceBandMaster } from '../../masters/entities/crane-experience-band-master.entity';
import { CraneResidencyStatusMaster } from '../../masters/entities/crane-residency-status-master.entity';

export const CRANE_APPLICATION_STATUSES = [
  'SUBMITTED',
  'SCREENING',
  'TECHNICAL_INTERVIEW',
  'FINAL_INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export type CraneApplicationStatus =
  (typeof CRANE_APPLICATION_STATUSES)[number];

/** Stages after which someone may apply to the same role again. */
export const CRANE_CLOSED_STATUSES: readonly CraneApplicationStatus[] = [
  'REJECTED',
  'WITHDRAWN',
];

/**
 * A submission to the crane careers form.
 *
 * The heaviest personal-data record in the system, and heavier than an IT
 * application: nationality and KSA residency status are close to protected
 * characteristics and commercially sensitive under Nitaqat, which is why this
 * sits behind its own feature code rather than travelling with the adverts.
 *
 * `nationality`, `mobile`, `certifications` and `backgroundSummary` are
 * `select: false`, so a list of candidates cannot leak them by forgetting to
 * exclude them.
 *
 * The CV arrives with the form, and up to four certificates with it. That is a
 * change from the original design, where the acknowledgement asked candidates
 * to reply with their CV attached — a route only as reliable as the mail
 * transport, which does not yet deliver.
 */
@Entity({ name: 'crane_applications' })
@Unique('vtx_crane_applications_reference_no_uq', ['referenceNo'])
export class CraneApplication {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_applications_id_pk',
  })
  id: string;

  @Column({ name: 'site_code', type: 'int', default: 102 })
  siteCode: number;

  /** VTX-HR-2026-0001 — the number quoted in the acknowledgement. */
  @Column({ name: 'reference_no', type: 'varchar', length: 30 })
  referenceNo: string;

  // --- Section 01: position of interest -----------------------------------

  @Index('idx_crane_applications_track')
  @Column({ name: 'track_code', type: 'int' })
  trackCode: number;

  @ManyToOne(() => CraneCareerTrackMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'track_code',
    referencedColumnName: 'trackCode',
    foreignKeyConstraintName: 'vtx_crane_applications_track_code_fk',
  })
  track?: CraneCareerTrackMaster;

  /** Null for a general application — one of the six tracks is exactly that. */
  @Index('idx_crane_applications_job')
  @Column({ name: 'job_id', type: 'uuid', nullable: true })
  jobId: string | null;

  @ManyToOne(() => CraneJobPosting, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'job_id',
    foreignKeyConstraintName: 'vtx_crane_applications_job_id_fk',
  })
  job?: CraneJobPosting;

  @Column({ name: 'experience_band_code', type: 'int' })
  experienceBandCode: number;

  @ManyToOne(() => CraneExperienceBandMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'experience_band_code',
    referencedColumnName: 'bandCode',
    foreignKeyConstraintName: 'vtx_crane_applications_experience_band_code_fk',
  })
  experienceBand?: CraneExperienceBandMaster;

  @Column({ name: 'availability_code', type: 'int', nullable: true })
  availabilityCode: number | null;

  @ManyToOne(() => CraneAvailabilityMaster, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({
    name: 'availability_code',
    referencedColumnName: 'availabilityCode',
    foreignKeyConstraintName: 'vtx_crane_applications_availability_code_fk',
  })
  availability?: CraneAvailabilityMaster;

  // --- Section 02: personal and contact -----------------------------------

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  @Column({
    name: 'nationality',
    type: 'varchar',
    length: 100,
    select: false,
  })
  nationality: string;

  @Index('idx_crane_applications_email')
  @Column({ name: 'email', type: 'varchar', length: 255 })
  email: string;

  /** Doubles as WhatsApp — the form asks for one number for both. */
  @Column({ name: 'mobile', type: 'varchar', length: 32, select: false })
  mobile: string;

  @Column({
    name: 'current_location',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  currentLocation: string | null;

  @Column({ name: 'residency_code', type: 'int' })
  residencyCode: number;

  @ManyToOne(() => CraneResidencyStatusMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'residency_code',
    referencedColumnName: 'residencyCode',
    foreignKeyConstraintName: 'vtx_crane_applications_residency_code_fk',
  })
  residency?: CraneResidencyStatusMaster;

  // --- Section 03: background and qualifications --------------------------

  @Column({ name: 'qualification_code', type: 'int' })
  qualificationCode: number;

  @ManyToOne(() => CraneCareerQualificationMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'qualification_code',
    referencedColumnName: 'qualificationCode',
    foreignKeyConstraintName: 'vtx_crane_applications_qualification_code_fk',
  })
  qualification?: CraneCareerQualificationMaster;

  /** EN, AR, HI, UR — the four the practice works in, plus whatever else. */
  @Column({ name: 'working_languages', type: 'text', array: true })
  workingLanguages: string[];

  /**
   * What they hold, in words — "ISO 9927, valid to 2027".
   *
   * Kept alongside the uploads rather than replaced by them: a filename is
   * usually IMG_2831.jpg, which tells a recruiter nothing.
   */
  @Column({
    name: 'certifications',
    type: 'varchar',
    length: 500,
    nullable: true,
    select: false,
  })
  certifications: string | null;

  @Column({ name: 'background_summary', type: 'text', select: false })
  backgroundSummary: string;

  // --- Uploads -------------------------------------------------------------

  /**
   * Required at submit, but nullable in the column.
   *
   * One application predates the upload and legitimately has none. Making this
   * NOT NULL would mean deleting a real submission or inventing a file, so the
   * requirement lives in the service — where "an application made today must
   * carry a CV" can be true without rewriting what happened yesterday.
   */
  @Column({ name: 'cv_file_id', type: 'uuid', nullable: true })
  cvFileId: string | null;

  @ManyToOne(() => StoredFile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'cv_file_id',
    foreignKeyConstraintName: 'vtx_crane_applications_cv_file_id_fk',
  })
  cvFile?: StoredFile;

  /** Moves with `cvFileId`; a CHECK constraint keeps the two in step. */
  @Column({ name: 'cv_attached_at', type: 'timestamptz', nullable: true })
  cvAttachedAt: Date | null;

  /**
   * Tickets and cards — ISO 9927, NDT Level II, a rigging licence.
   *
   * A join table rather than four columns, so the cap is a product rule the
   * service enforces rather than a shape the schema is stuck with. Images are
   * accepted for these and nowhere else: they are plastic cards, and people
   * photograph them.
   */
  @ManyToMany(() => StoredFile)
  @JoinTable({
    name: 'crane_application_certificates',
    joinColumn: { name: 'application_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'file_id', referencedColumnName: 'id' },
  })
  certificateFiles?: StoredFile[];

  // --- Pipeline -----------------------------------------------------------

  @Index('idx_crane_applications_status')
  @Column({ name: 'status', type: 'varchar', length: 24, default: 'SUBMITTED' })
  status: CraneApplicationStatus;

  /** The page promises a reference within the hour. */
  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  /**
   * When the CURRENT stage is due, on the Riyadh working week.
   *
   * Recomputed on every stage change from the SLAs the page publishes — five
   * working days to screen, two weeks to the technical interview, and so on.
   * One column rather than five, because only the stage you are in has a
   * deadline anyone is waiting on.
   */
  @Column({ name: 'stage_due_at', type: 'timestamptz', nullable: true })
  stageDueAt: Date | null;

  @Column({ name: 'assigned_to', type: 'varchar', length: 150, nullable: true })
  assignedTo: string | null;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  // --- Consent and retention ----------------------------------------------

  @Column({ name: 'consent_at', type: 'timestamptz' })
  consentAt: Date;

  @Column({ name: 'privacy_notice_version', type: 'varchar', length: 50 })
  privacyNoticeVersion: string;

  /** "Profile retention: 12 months under PDPL", as the page states. */
  @Column({ name: 'retention_until', type: 'timestamptz' })
  retentionUntil: Date;

  // --- Provenance ---------------------------------------------------------

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
