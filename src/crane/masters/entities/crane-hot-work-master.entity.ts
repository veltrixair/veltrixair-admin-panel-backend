import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Whether a permit to work or confined-space entry is anticipated. */
@Entity({ name: 'crane_hot_work_masters' })
@Unique('vtx_crane_hot_work_masters_hot_work_code_unique', ['hotWorkCode'])
export class CraneHotWorkMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_hot_work_masters_id_pk',
  })
  id: string;

  @Column({ name: 'hot_work_code', type: 'int' })
  hotWorkCode: number;

  @Column({ name: 'hot_work_name', type: 'varchar', length: 120 })
  hotWorkName: string;

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
