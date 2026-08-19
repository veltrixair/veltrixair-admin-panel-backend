import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Where a role is based. The hubs are Riyadh and Jubail; "Multi-site" covers the inspectors and HSE roles that travel. */
@Entity({ name: 'crane_job_location_masters' })
@Unique('vtx_crane_job_location_masters_code_uq', ['locationCode'])
export class CraneJobLocationMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_job_location_masters_id_pk',
  })
  id: string;

  @Column({ name: 'site_code', type: 'int', default: 102 })
  siteCode: number;

  @Column({ name: 'location_code', type: 'int' })
  locationCode: number;

  @Column({ name: 'location_name', type: 'varchar', length: 150 })
  locationName: string;

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
