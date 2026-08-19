import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** KSA residency, which decides whether someone can be deployed to a site at all. Recorded as given — nothing is inferred from it and nothing is rejected because of it. */
@Entity({ name: 'crane_residency_status_masters' })
@Unique('vtx_crane_residency_status_masters_code_uq', ['residencyCode'])
export class CraneResidencyStatusMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_residency_status_masters_id_pk',
  })
  id: string;

  @Column({ name: 'site_code', type: 'int', default: 102 })
  siteCode: number;

  @Column({ name: 'residency_code', type: 'int' })
  residencyCode: number;

  @Column({ name: 'residency_name', type: 'varchar', length: 150 })
  residencyName: string;

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
