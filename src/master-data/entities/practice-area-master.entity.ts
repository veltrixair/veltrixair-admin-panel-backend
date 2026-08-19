import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Practice filter on /careers/ — Software, Platform, Cyber, Privacy, … */
@Entity({ name: 'practice_area_masters' })
@Unique('vtx_practice_area_masters_practice_code_unique', ['practiceCode'])
export class PracticeAreaMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_practice_area_masters_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'practice_code', type: 'int' })
  practiceCode: number;

  /** Short label used by the filter chips, e.g. "Business Apps". */
  @Column({ name: 'practice_name', type: 'varchar', length: 100 })
  practiceName: string;

  /** URL-safe form used as the ?practice= query value. */
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
