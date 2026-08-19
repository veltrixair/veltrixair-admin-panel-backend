import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Crane configuration. */
@Entity({ name: 'crane_type_masters' })
@Unique('vtx_crane_type_masters_crane_type_code_unique', ['craneTypeCode'])
export class CraneTypeMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_type_masters_id_pk',
  })
  id: string;

  @Column({ name: 'crane_type_code', type: 'int' })
  craneTypeCode: number;

  @Column({ name: 'crane_type_name', type: 'varchar', length: 150 })
  craneTypeName: string;

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
