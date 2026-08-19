import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Operating environment — corrosion, heat and hazardous-area classification all follow from this. */
@Entity({ name: 'crane_environment_masters' })
@Unique('vtx_crane_environment_masters_environment_code_unique', [
  'environmentCode',
])
export class CraneEnvironmentMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_environment_masters_id_pk',
  })
  id: string;

  @Column({ name: 'environment_code', type: 'int' })
  environmentCode: number;

  @Column({ name: 'environment_name', type: 'varchar', length: 150 })
  environmentName: string;

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
