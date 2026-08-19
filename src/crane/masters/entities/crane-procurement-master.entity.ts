import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** How the customer buys — a formal tender needs a very different response to a direct PO. */
@Entity({ name: 'crane_procurement_masters' })
@Unique('vtx_crane_procurement_masters_procurement_code_unique', [
  'procurementCode',
])
export class CraneProcurementMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_procurement_masters_id_pk',
  })
  id: string;

  @Column({ name: 'procurement_code', type: 'int' })
  procurementCode: number;

  @Column({ name: 'procurement_name', type: 'varchar', length: 120 })
  procurementName: string;

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
