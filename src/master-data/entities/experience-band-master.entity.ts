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
 * The experience bands on the job application form.
 *
 * One table serves both questions on that form. "Total experience" offers
 * every row; "Relevant experience" offers the same list with Fresher removed,
 * because somebody with no experience at all has no relevant experience to
 * report either — the question does not apply rather than having a zero answer.
 * `availableForRelevant` is what carries that rule, so the exclusion lives in
 * the data instead of being a special case written into the service.
 *
 * `minYears` is the band's lower bound, and it exists so the application row
 * can keep a filterable number alongside the band the candidate picked. The
 * admin list filters on ">= N years"; a band alone cannot answer that, and
 * duplicating the mapping in code is how the two would drift apart.
 */
@Entity({ name: 'experience_band_masters' })
@Unique('vtx_experience_band_masters_experience_band_code_unique', [
  'experienceBandCode',
])
export class ExperienceBandMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_experience_band_masters_id_pk',
  })
  id: string;

  @Column({ name: 'experience_band_code', type: 'int' })
  experienceBandCode: number;

  /** Shown verbatim in the dropdown, e.g. "3–5 years". */
  @Column({ name: 'experience_band_name', type: 'varchar', length: 50 })
  experienceBandName: string;

  /**
   * The lower bound of the band, in years. Fresher and "0–1 year" both sit at
   * zero, which is correct: neither claims any completed year.
   */
  @Column({
    name: 'min_years',
    type: 'numeric',
    precision: 4,
    scale: 1,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  minYears: number;

  /** False only for Fresher. See the class docblock. */
  @Column({ name: 'available_for_relevant', type: 'boolean', default: true })
  availableForRelevant: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
  })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
