import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Which careers page a posting belongs on — Internship, Coach, Experienced.
 *
 * The site has one page per category and each shows only its own roles, so a
 * posting needs to say which it is. Separate from `practice` and from
 * `employment_type`, because those answer different questions: practice is the
 * business line (a Platform internship and a Platform senior role are both
 * Platform), and employment type is the basis someone is engaged on (an
 * internship is also full-time). Folding any two of them together would make
 * one of the three unanswerable.
 *
 * A master rather than a varchar for the usual reason: "Internship",
 * "internship" and "Intern" would otherwise become three categories, and
 * nothing would be able to list the valid set for the admin form.
 */
@Entity({ name: 'job_category_masters' })
@Unique('vtx_job_category_masters_category_code_unique', ['categoryCode'])
export class JobCategoryMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_job_category_masters_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'category_code', type: 'int' })
  categoryCode: number;

  /** Shown on the page and in the admin form, e.g. "Experienced". */
  @Column({ name: 'category_name', type: 'varchar', length: 100 })
  categoryName: string;

  /**
   * URL-safe form, and the value the careers pages already send as
   * `?category=` — "internship", "coach", "experienced".
   */
  @Column({ name: 'slug', type: 'varchar', length: 100 })
  slug: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
