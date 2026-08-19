import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Why the engineer is coming. Drives who gets assigned and whether the visit is billable. */
@Entity({ name: 'crane_visit_purpose_masters' })
@Unique('vtx_crane_visit_purpose_masters_visit_purpose_code_unique', [
  'visitPurposeCode',
])
export class CraneVisitPurposeMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_visit_purpose_masters_id_pk',
  })
  id: string;

  @Column({ name: 'visit_purpose_code', type: 'int' })
  visitPurposeCode: number;

  @Column({ name: 'visit_purpose_name', type: 'varchar', length: 200 })
  visitPurposeName: string;

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
