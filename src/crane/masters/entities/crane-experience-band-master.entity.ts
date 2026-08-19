import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Bands rather than a number of years, matching the form. A band is what a field hire actually answers, and it keeps the filter honest. */
@Entity({ name: 'crane_experience_band_masters' })
@Unique('vtx_crane_experience_band_masters_code_uq', ['bandCode'])
export class CraneExperienceBandMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_experience_band_masters_id_pk',
  })
  id: string;

  @Column({ name: 'site_code', type: 'int', default: 102 })
  siteCode: number;

  @Column({ name: 'band_code', type: 'int' })
  bandCode: number;

  @Column({ name: 'band_name', type: 'varchar', length: 150 })
  bandName: string;

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
