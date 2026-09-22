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
import { CraneCareerTrackMaster } from '../../masters/entities/crane-career-track-master.entity';
import { CraneDepartmentMaster } from '../../masters/entities/crane-department-master.entity';
import { CraneEmploymentTypeMaster } from '../../masters/entities/crane-employment-type-master.entity';
import { CraneExperienceBandMaster } from '../../masters/entities/crane-experience-band-master.entity';
import { CraneJobLocationMaster } from '../../masters/entities/crane-job-location-master.entity';
import { CraneServiceLineMaster } from '../../masters/entities/crane-service-line-master.entity';

export const CRANE_JOB_STATUSES = ['DRAFT', 'OPEN', 'CLOSED'] as const;

export type CraneJobStatus = (typeof CRANE_JOB_STATUSES)[number];

/**
 * A vacancy on veltrixairindustries.com/careers/.
 *
 * Its own table rather than `job_postings`, because a crane advert is filed by
 * career track and service line, sits in a named hub, and states an experience
 * band and a certification list — none of which the IT board has. The two
 * boards share a slug and a title and little else.
 */
@Entity({ name: 'crane_job_postings' })
@Unique('vtx_crane_job_postings_slug_uq', ['slug'])
@Unique('vtx_crane_job_postings_ref_code_uq', ['refCode'])
export class CraneJobPosting {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_job_postings_id_pk',
  })
  id: string;

  @Column({ name: 'site_code', type: 'int', default: 102 })
  siteCode: number;

  @Column({ name: 'ref_code', type: 'varchar', length: 20 })
  refCode: string;

  @Column({ name: 'slug', type: 'varchar', length: 200 })
  slug: string;

  @Column({ name: 'title', type: 'varchar', length: 200 })
  title: string;

  // --- Taxonomy ----------------------------------------------------------

  @Index('idx_crane_job_postings_track')
  @Column({ name: 'track_code', type: 'int' })
  trackCode: number;

  @ManyToOne(() => CraneCareerTrackMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'track_code',
    referencedColumnName: 'trackCode',
    foreignKeyConstraintName: 'vtx_crane_job_postings_track_code_fk',
  })
  track?: CraneCareerTrackMaster;

  /**
   * The part of the business that owns the headcount.
   *
   * Separate from the track, which is the route a candidate applies through.
   * Nullable: the graduate intake and the speculative pile belong to no single
   * department, and adverts published before this existed have none.
   */
  @Column({ name: 'department_code', type: 'int', nullable: true })
  departmentCode: number | null;

  @ManyToOne(() => CraneDepartmentMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'department_code',
    referencedColumnName: 'departmentCode',
    foreignKeyConstraintName: 'vtx_crane_job_postings_department_code_fk',
  })
  department?: CraneDepartmentMaster | null;

  /**
   * The discipline the advert prints as VTX-CRN-xx.
   *
   * Null for the roles outside the service catalogue — the sales executive,
   * the HSE coordinator, the graduate programme.
   */
  @Column({ name: 'service_line_code', type: 'int', nullable: true })
  serviceLineCode: number | null;

  @ManyToOne(() => CraneServiceLineMaster, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({
    name: 'service_line_code',
    referencedColumnName: 'serviceLineCode',
    foreignKeyConstraintName: 'vtx_crane_job_postings_service_line_code_fk',
  })
  serviceLine?: CraneServiceLineMaster;

  @Column({ name: 'location_code', type: 'int' })
  locationCode: number;

  @ManyToOne(() => CraneJobLocationMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'location_code',
    referencedColumnName: 'locationCode',
    foreignKeyConstraintName: 'vtx_crane_job_postings_location_code_fk',
  })
  location?: CraneJobLocationMaster;

  @Column({ name: 'employment_type_code', type: 'int' })
  employmentTypeCode: number;

  @ManyToOne(() => CraneEmploymentTypeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'employment_type_code',
    referencedColumnName: 'employmentTypeCode',
    foreignKeyConstraintName: 'vtx_crane_job_postings_employment_type_code_fk',
  })
  employmentType?: CraneEmploymentTypeMaster;

  /** Null where the advert states no minimum — the statutory inspector role. */
  @Column({ name: 'experience_band_code', type: 'int', nullable: true })
  experienceBandCode: number | null;

  @ManyToOne(() => CraneExperienceBandMaster, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({
    name: 'experience_band_code',
    referencedColumnName: 'bandCode',
    foreignKeyConstraintName: 'vtx_crane_job_postings_experience_band_code_fk',
  })
  experienceBand?: CraneExperienceBandMaster;

  // --- Copy --------------------------------------------------------------

  @Column({ name: 'summary', type: 'varchar', length: 500, nullable: true })
  summary: string | null;

  @Column({ name: 'description_mdx', type: 'text', nullable: true })
  descriptionMdx: string | null;

  @Column({
    name: 'responsibilities',
    type: 'text',
    array: true,
    default: '{}',
  })
  responsibilities: string[];

  @Column({ name: 'requirements', type: 'text', array: true, default: '{}' })
  requirements: string[];

  /**
   * "ISO 9927", "NDT Level II". Free text rather than a master, because a
   * ticket is whatever its awarding body calls it and a fixed list goes stale.
   */
  @Column({ name: 'certifications', type: 'text', array: true, default: '{}' })
  certifications: string[];

  /**
   * Printed on the advert, never enforced at submit. Refusing an applicant by
   * nationality is a legal question, not a technical one — so this is shown,
   * and the decision stays with a human.
   */
  @Column({ name: 'saudi_nationals_only', type: 'boolean', default: false })
  saudiNationalsOnly: boolean;

  @Column({ name: 'openings', type: 'int', default: 1 })
  openings: number;

  /**
   * Pins the advert to the top of the board and prints the "Hot" badge.
   *
   * Presentation only — it changes nothing about who may apply. Indexed
   * because the default ordering sorts on it.
   */
  @Index('idx_crane_job_postings_hot_role')
  @Column({ name: 'hot_role', type: 'boolean', default: false })
  hotRole: boolean;

  // --- Lifecycle ---------------------------------------------------------

  @Index('idx_crane_job_postings_status')
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'DRAFT' })
  status: CraneJobStatus;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'seo_title', type: 'varchar', length: 200, nullable: true })
  seoTitle: string | null;

  @Column({
    name: 'seo_description',
    type: 'varchar',
    length: 400,
    nullable: true,
  })
  seoDescription: string | null;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt: Date | null;

  @Column({ name: 'closes_at', type: 'timestamptz', nullable: true })
  closesAt: Date | null;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
