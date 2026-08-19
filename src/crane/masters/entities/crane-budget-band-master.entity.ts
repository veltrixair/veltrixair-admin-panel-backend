import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Budget envelope in SAR. A band rather than a figure, because most enquirers will not commit to a number before scope. */
@Entity({ name: 'crane_budget_band_masters' })
@Unique('vtx_crane_budget_band_masters_budget_band_code_unique', [
  'budgetBandCode',
])
export class CraneBudgetBandMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_budget_band_masters_id_pk',
  })
  id: string;

  @Column({ name: 'budget_band_code', type: 'int' })
  budgetBandCode: number;

  @Column({ name: 'budget_band_name', type: 'varchar', length: 120 })
  budgetBandName: string;

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
