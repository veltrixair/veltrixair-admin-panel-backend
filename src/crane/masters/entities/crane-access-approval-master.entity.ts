import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Site access status. The single biggest driver of when an engineer can actually stand in front of the crane. */
@Entity({ name: 'crane_access_approval_masters' })
@Unique('vtx_crane_access_approval_masters_access_approval_code_unique', [
  'accessApprovalCode',
])
export class CraneAccessApprovalMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_access_approval_masters_id_pk',
  })
  id: string;

  @Column({ name: 'access_approval_code', type: 'int' })
  accessApprovalCode: number;

  @Column({ name: 'access_approval_name', type: 'varchar', length: 150 })
  accessApprovalName: string;

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
