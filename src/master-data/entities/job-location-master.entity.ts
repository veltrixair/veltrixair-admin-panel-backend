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
 * Location filter on /careers/ — Riyadh, Dubai, Bangalore, Remote.
 *
 * Deliberately separate from `office_masters`: "Remote" is a filter value but
 * not an office, and a role can carry several locations ("Dubai / Riyadh").
 */
@Entity({ name: 'job_location_masters' })
@Unique('vtx_job_location_masters_location_code_unique', ['locationCode'])
export class JobLocationMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_job_location_masters_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'location_code', type: 'int' })
  locationCode: number;

  @Column({ name: 'location_name', type: 'varchar', length: 100 })
  locationName: string;

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
