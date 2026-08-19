import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** When an engineer can attend. A separate scale from the quote form urgency, which is about when work must finish. */
@Entity({ name: 'crane_visit_urgency_masters' })
@Unique('vtx_crane_visit_urgency_masters_visit_urgency_code_unique', [
  'visitUrgencyCode',
])
export class CraneVisitUrgencyMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_visit_urgency_masters_id_pk',
  })
  id: string;

  @Column({ name: 'visit_urgency_code', type: 'int' })
  visitUrgencyCode: number;

  @Column({ name: 'visit_urgency_name', type: 'varchar', length: 120 })
  visitUrgencyName: string;

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
