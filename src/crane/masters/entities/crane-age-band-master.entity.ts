import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Approximate fleet age. Pre-2000 equipment changes what a survey has to look for. */
@Entity({ name: 'crane_age_band_masters' })
@Unique('vtx_crane_age_band_masters_age_band_code_unique', ['ageBandCode'])
export class CraneAgeBandMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_age_band_masters_id_pk',
  })
  id: string;

  @Column({ name: 'age_band_code', type: 'int' })
  ageBandCode: number;

  @Column({ name: 'age_band_name', type: 'varchar', length: 60 })
  ageBandName: string;

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
