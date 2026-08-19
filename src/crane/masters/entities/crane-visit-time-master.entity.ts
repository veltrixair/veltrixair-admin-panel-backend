import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Preferred time of day — a shift-change observation is a different visit from a morning walk-down. */
@Entity({ name: 'crane_visit_time_masters' })
@Unique('vtx_crane_visit_time_masters_visit_time_code_unique', [
  'visitTimeCode',
])
export class CraneVisitTimeMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_visit_time_masters_id_pk',
  })
  id: string;

  @Column({ name: 'visit_time_code', type: 'int' })
  visitTimeCode: number;

  @Column({ name: 'visit_time_name', type: 'varchar', length: 120 })
  visitTimeName: string;

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
