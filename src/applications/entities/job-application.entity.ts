import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { JobPosting } from '../../careers/entities/job-posting.entity';
import { StoredFile } from '../../files/entities/stored-file.entity';
import { ExperienceBandMaster } from '../../master-data/entities/experience-band-master.entity';
import { NoticePeriodMaster } from '../../master-data/entities/notice-period-master.entity';
import { QualificationMaster } from '../../master-data/entities/qualification-master.entity';
import { WorkAuthorisationMaster } from '../../master-data/entities/work-authorisation-master.entity';

export const APPLICATION_STATUSES = [
  'NEW',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Statuses after which a candidate may apply to the same role again. */
export const CLOSED_STATUSES: readonly ApplicationStatus[] = [
  'REJECTED',
  'WITHDRAWN',
];

/**
 * A candidate's application to a job.
 *
 * The heaviest concentration of personal data in this system: name, contact
 * details, salary expectation, immigration status and a CV. Handled the same
 * way as contact enquiries but more strictly —
 *
 *  - `phone`, `coverNote` and `expectedSalary` are `select: false`, so a list
 *    endpoint cannot leak them by forgetting to exclude them. Salary in
 *    particular has no business appearing in a table of candidates.
 *  - The résumé lives in `stored_files` with a 12-month retention date, and the
 *    existing purge job deletes it without anyone remembering to.
 *  - Withdrawal deletes the résumé object immediately rather than waiting for
 *    that date, because a withdrawal is a revocation of consent.
 *
 * `jobId` is nullable so a general talent-pool application can be accepted
 * later without a migration. Nothing writes null today.
 */
@Entity({ name: 'job_applications' })
@Unique('vtx_job_applications_reference_no_unique', ['referenceNo'])
@Unique('vtx_job_applications_manage_token_unique', ['manageToken'])
export class JobApplication {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_job_applications_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  /** Quoted to the candidate; the reference they use in any correspondence. */
  @Index('idx_job_applications_reference_no')
  @Column({ name: 'reference_no', type: 'varchar', length: 30 })
  referenceNo: string;

  @Index('idx_job_applications_job_id')
  @Column({ name: 'job_id', type: 'uuid', nullable: true })
  jobId: string | null;

  @ManyToOne(() => JobPosting, { onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'job_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_job_applications_job_id_fk',
  })
  job?: JobPosting;

  // --- Identity ----------------------------------------------------------

  /**
   * One field, not a first/last pair, because the form asks one question.
   *
   * Splitting a name on whitespace is a guess, and it is wrong often enough to
   * matter across the regions these postings run in — "Syed Adil Bakshi" has no
   * reliable split, and neither does a mononym. Storing what the candidate
   * typed keeps the record accurate; anything that wants a short form can ask.
   */
  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName: string;

  @Index('idx_job_applications_email')
  @Column({ name: 'email', type: 'varchar', length: 255 })
  email: string;

  @Column({
    name: 'phone',
    type: 'varchar',
    length: 30,
    nullable: true,
    select: false,
  })
  phone: string | null;

  // --- Professional ------------------------------------------------------

  /**
   * Nullable from here down, and for one reason worth stating once: a posting
   * can switch any of these questions off, and a question that was never asked
   * has no answer. Which of the two a null means is read off the posting's
   * `applicationFields`, not guessed.
   */
  @Column({
    name: 'current_title',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  currentTitle: string | null;

  @Column({
    name: 'current_company',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  currentCompany: string | null;

  @Column({ name: 'qualification_code', type: 'int', nullable: true })
  qualificationCode: number | null;

  @ManyToOne(() => QualificationMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'qualification_code',
    referencedColumnName: 'qualificationCode',
    foreignKeyConstraintName: 'vtx_job_applications_qualification_code_fk',
  })
  qualification?: QualificationMaster;

  /** The band the candidate picked. This is the answer of record. */
  @Column({ name: 'experience_band_code', type: 'int', nullable: true })
  experienceBandCode: number | null;

  @ManyToOne(() => ExperienceBandMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'experience_band_code',
    referencedColumnName: 'experienceBandCode',
    foreignKeyConstraintName: 'vtx_job_applications_experience_band_code_fk',
  })
  experienceBand?: ExperienceBandMaster;

  /**
   * The band's lower bound, copied from the master at submission.
   *
   * Derived, never asked for: the form offers bands, but the admin list filters
   * on ">= N years" and a band cannot answer that. Kept as its own column
   * rather than joined at query time so the filter stays a plain index scan,
   * and frozen at submission so a later edit to a band's bounds cannot silently
   * restate what a candidate said.
   */
  @Column({
    name: 'experience_years',
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
    transformer: {
      to: (value: number) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  experienceYears: number | null;

  /**
   * Of the total, how much is in this discipline. The same bands minus
   * Fresher — see ExperienceBandMaster.availableForRelevant.
   */
  @Column({
    name: 'relevant_experience_band_code',
    type: 'int',
    nullable: true,
  })
  relevantExperienceBandCode: number | null;

  @ManyToOne(() => ExperienceBandMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'relevant_experience_band_code',
    referencedColumnName: 'experienceBandCode',
    foreignKeyConstraintName:
      'vtx_job_applications_relevant_experience_band_code_fk',
  })
  relevantExperienceBand?: ExperienceBandMaster;

  /** Derived from the relevant band, for the same reason as above. */
  @Column({
    name: 'relevant_experience_years',
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
    transformer: {
      to: (value: number) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  relevantExperienceYears: number | null;

  @Column({
    name: 'linkedin_url',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  linkedinUrl: string | null;

  @Column({
    name: 'portfolio_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  portfolioUrl: string | null;

  /**
   * A Postgres text[] with a GIN index, so "who knows Terraform" is an
   * indexed containment query rather than a LIKE across every row.
   */
  @Column({ name: 'key_skills', type: 'text', array: true, nullable: true })
  keySkills: string[] | null;

  // --- Logistics ---------------------------------------------------------

  @Column({ name: 'city', type: 'varchar', length: 100, nullable: true })
  city: string | null;

  /**
   * Where the candidate lives, as the form asks it — a plain string, not a
   * code against country_masters.
   *
   * That table is a routing table: every row carries an owning office, and a
   * contact enquiry's SLA clock runs on that office's working week. None of
   * that applies here. This question only ever said "where are you", nothing
   * downstream read it, and the join existed solely to print the name back.
   *
   * Worth knowing if this becomes a dropdown later: storing ISO 3166-1 alpha-2
   * instead would survive relabelling ("Turkey" to "Türkiye") and validates
   * against @IsISO31661Alpha2() with no table at all. A free string is the
   * right fit only while the field is free text.
   */
  @Column({
    name: 'current_country',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  currentCountry: string | null;

  @Column({ name: 'notice_period_code', type: 'int', nullable: true })
  noticePeriodCode: number | null;

  @ManyToOne(() => NoticePeriodMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'notice_period_code',
    referencedColumnName: 'noticePeriodCode',
    foreignKeyConstraintName: 'vtx_job_applications_notice_period_code_fk',
  })
  noticePeriod?: NoticePeriodMaster;

  @Column({ name: 'work_authorisation_code', type: 'int', nullable: true })
  workAuthorisationCode: number | null;

  @ManyToOne(() => WorkAuthorisationMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'work_authorisation_code',
    referencedColumnName: 'workAuthorisationCode',
    foreignKeyConstraintName: 'vtx_job_applications_work_authorisation_code_fk',
  })
  workAuthorisation?: WorkAuthorisationMaster;

  /** Numeric because it is filtered and compared. Current CTC is not — see
   *  `currentCtc`, which is free text on purpose. */
  @Column({
    name: 'expected_salary',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    select: false,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  expectedSalary: number | null;

  /**
   * Free text, matching the design. Current pay is the question candidates
   * answer with "negotiable" or "SAR 30k/month" as often as with a number,
   * and forcing it numeric loses all of those answers.
   */
  @Column({
    name: 'current_ctc',
    type: 'varchar',
    length: 60,
    nullable: true,
    select: false,
  })
  currentCtc: string | null;

  /**
   * ISO 4217 for the figure above. The form sends it as a hidden field beside
   * the amount, so it is stored rather than discarded — "12,00,000" means very
   * different things in INR and AED, and currentCtc is free text that need not
   * name its own currency.
   *
   * `select: false` for the same reason as the amount: pay is not list data.
   */
  @Column({
    name: 'current_ctc_currency',
    type: 'varchar',
    length: 3,
    nullable: true,
    select: false,
  })
  currentCtcCurrency: string | null;

  /** NULL means the question was not asked — not "no". */
  @Column({ name: 'willing_to_relocate', type: 'boolean', nullable: true })
  willingToRelocate: boolean | null;

  /** ISO 4217 — SAR, AED, INR. Meaningless without it across three markets. */
  @Column({
    name: 'salary_currency',
    type: 'char',
    length: 3,
    nullable: true,
    select: false,
  })
  salaryCurrency: string | null;

  // --- Application -------------------------------------------------------

  @Column({ name: 'resume_file_id', type: 'uuid', nullable: true })
  resumeFileId: string | null;

  @ManyToOne(() => StoredFile, { onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'resume_file_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_job_applications_resume_file_id_fk',
  })
  resumeFile?: StoredFile;

  @Column({
    name: 'cover_note',
    type: 'varchar',
    length: 4000,
    nullable: true,
    select: false,
  })
  coverNote: string | null;

  @Column({ name: 'source_code', type: 'int', nullable: true })
  sourceCode: number | null;

  // --- Pipeline ----------------------------------------------------------

  @Index('idx_job_applications_status')
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'NEW' })
  status: ApplicationStatus;

  @Column({ name: 'assigned_to', type: 'varchar', length: 150, nullable: true })
  assignedTo: string | null;

  /** Lets the candidate check status or withdraw without an account. */
  @Column({ name: 'manage_token', type: 'varchar', length: 64, select: false })
  manageToken: string;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;

  // --- Consent and provenance -------------------------------------------

  @Column({ name: 'consent_at', type: 'timestamptz' })
  consentAt: Date;

  @Column({ name: 'privacy_notice_version', type: 'varchar', length: 50 })
  privacyNoticeVersion: string;

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

  @Column({
    name: 'user_agent',
    type: 'varchar',
    length: 500,
    nullable: true,
    select: false,
  })
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
