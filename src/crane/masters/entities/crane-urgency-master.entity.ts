import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Engagement urgency. Asked of every submission, so it is the reliable routing signal — the P1 question in section 04 only appears for breakdown response. */
@Entity({ name: 'crane_urgency_masters' })
@Unique('vtx_crane_urgency_masters_urgency_code_unique', ['urgencyCode'])
export class CraneUrgencyMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_urgency_masters_id_pk',
  })
  id: string;

  @Column({ name: 'urgency_code', type: 'int' })
  urgencyCode: number;

  @Column({ name: 'urgency_name', type: 'varchar', length: 120 })
  urgencyName: string;

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
