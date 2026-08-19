import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** "How did you find us?" — which channels actually produce crane enquiries. */
@Entity({ name: 'crane_lead_source_masters' })
@Unique('vtx_crane_lead_source_masters_lead_source_code_unique', [
  'leadSourceCode',
])
export class CraneLeadSourceMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_lead_source_masters_id_pk',
  })
  id: string;

  @Column({ name: 'lead_source_code', type: 'int' })
  leadSourceCode: number;

  @Column({ name: 'lead_source_name', type: 'varchar', length: 120 })
  leadSourceName: string;

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
