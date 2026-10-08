import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { JobLocationMaster } from '../../master-data/entities/job-location-master.entity';
import { OfficeMaster } from '../../master-data/entities/office-master.entity';
import { JobCategoryMaster } from '../../master-data/entities/job-category-master.entity';
import { PracticeAreaMaster } from '../../master-data/entities/practice-area-master.entity';
import type { ApplicationFieldConfig } from '../../applications/application-fields.constants';

export const JOB_STATUSES = ['DRAFT', 'OPEN', 'CLOSED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const WORK_MODES = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

/** A role listed on /careers/ — R-001 … R-014. */
@Entity({ name: 'job_postings' })
@Unique('vtx_job_postings_ref_code_unique', ['refCode'])
@Unique('vtx_job_postings_slug_unique', ['slug'])
export class JobPosting {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_job_postings_id_pk',
  })
  id: string;

  /** Which of the three brands this role belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'ref_code', type: 'varchar', length: 20 })
  refCode: string;

  @Column({ name: 'slug', type: 'varchar', length: 200 })
  slug: string;

  @Column({ name: 'title', type: 'varchar', length: 200 })
  title: string;

  /**
   * The whole advert, in MDX.
   *
   * Summary, responsibilities and requirements used to be separate columns;
   * they are sections of this markdown now. `text` is unbounded in Postgres,
   * so there is no ceiling to run into.
   */
  @Column({ name: 'description_mdx', type: 'text' })
  descriptionMdx: string;

  /**
   * Which careers page this posting appears on. NOT NULL deliberately — a
   * posting with no category would be invisible on every page, which is a
   * worse failure than being on the wrong one, because nothing shows it.
   */
  @Index('idx_job_postings_category_code')
  @Column({ name: 'category_code', type: 'int' })
  categoryCode: number;

  @ManyToOne(() => JobCategoryMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'category_code',
    referencedColumnName: 'categoryCode',
    foreignKeyConstraintName: 'vtx_job_postings_category_code_fk',
  })
  category?: JobCategoryMaster;

  @Column({ name: 'practice_code', type: 'int' })
  practiceCode: number;

  @ManyToOne(() => PracticeAreaMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'practice_code',
    referencedColumnName: 'practiceCode',
    foreignKeyConstraintName: 'vtx_job_postings_practice_code_fk',
  })
  practice?: PracticeAreaMaster;

  /** A role can sit in several locations — "Dubai / Riyadh". */
  @ManyToMany(() => JobLocationMaster)
  @JoinTable({
    name: 'job_posting_locations',
    joinColumn: {
      name: 'job_posting_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'vtx_job_posting_locations_job_posting_id_fk',
    },
    inverseJoinColumn: {
      name: 'location_code',
      referencedColumnName: 'locationCode',
      foreignKeyConstraintName: 'vtx_job_posting_locations_location_code_fk',
    },
  })
  locations?: JobLocationMaster[];

  /** The free-text line the card prints, e.g. "Riyadh / Dubai / Remote". */
  @Column({
    name: 'location_label',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  locationLabel: string | null;

  @Column({ name: 'work_mode', type: 'varchar', length: 10 })
  workMode: WorkMode;

  @Column({ name: 'office_code', type: 'int' })
  officeCode: number;

  @ManyToOne(() => OfficeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'office_code',
    referencedColumnName: 'officeCode',
    foreignKeyConstraintName: 'vtx_job_postings_office_code_fk',
  })
  office?: OfficeMaster;

  @Column({ name: 'employment_type', type: 'varchar', length: 100 })
  employmentType: string;

  /** "5+ years", "2–4 years" — the phrase, now that the numbers are gone. */
  @Column({ name: 'experience_label', type: 'varchar', length: 50 })
  experienceLabel: string;

  /** Which of the three brands this row belongs to. */

  /**
   * Which questions this role asks its applicants, and which are required.
   *
   * NULL means the defaults, so every posting written before this existed
   * behaves as it always did. The catalogue of possible questions lives in
   * application-fields.constants.ts — a posting picks from a known list, it
   * cannot invent fields, which is what keeps this a configuration rather
   * than a form builder.
   */
  @Column({ name: 'application_fields', type: 'jsonb', nullable: true })
  applicationFields: ApplicationFieldConfig | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'seo_title', type: 'varchar', length: 200, nullable: true })
  seoTitle: string | null;

  @Column({
    name: 'seo_description',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  seoDescription: string | null;

  // --- Lifecycle ---------------------------------------------------------

  @Index('idx_job_postings_status')
  @Column({ name: 'status', type: 'varchar', length: 10, default: 'DRAFT' })
  status: JobStatus;

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
