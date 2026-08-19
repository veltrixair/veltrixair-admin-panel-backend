import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** How long the customer expects the engineer to be on site. */
@Entity({ name: 'crane_visit_duration_masters' })
@Unique('vtx_crane_visit_duration_masters_visit_duration_code_unique', [
  'visitDurationCode',
])
export class CraneVisitDurationMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_visit_duration_masters_id_pk',
  })
  id: string;

  @Column({ name: 'visit_duration_code', type: 'int' })
  visitDurationCode: number;

  @Column({ name: 'visit_duration_name', type: 'varchar', length: 120 })
  visitDurationName: string;

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
