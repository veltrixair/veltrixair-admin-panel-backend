import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Who supplies personal protective equipment. */
@Entity({ name: 'crane_ppe_provider_masters' })
@Unique('vtx_crane_ppe_provider_masters_ppe_provider_code_unique', [
  'ppeProviderCode',
])
export class CranePpeProviderMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_ppe_provider_masters_id_pk',
  })
  id: string;

  @Column({ name: 'ppe_provider_code', type: 'int' })
  ppeProviderCode: number;

  @Column({ name: 'ppe_provider_name', type: 'varchar', length: 120 })
  ppeProviderName: string;

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
