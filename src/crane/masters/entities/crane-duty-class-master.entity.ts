import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** FEM / ISO duty classification. */
@Entity({ name: 'crane_duty_class_masters' })
@Unique('vtx_crane_duty_class_masters_duty_class_code_unique', [
  'dutyClassCode',
])
export class CraneDutyClassMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_duty_class_masters_id_pk',
  })
  id: string;

  @Column({ name: 'duty_class_code', type: 'int' })
  dutyClassCode: number;

  @Column({ name: 'duty_class_name', type: 'varchar', length: 150 })
  dutyClassName: string;

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
