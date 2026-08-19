import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Whether anyone is paying. Pre-quote visits are typically free; forensic and standalone assessments are not. */
@Entity({ name: 'crane_engagement_type_masters' })
@Unique('vtx_crane_engagement_type_masters_engagement_type_code_unique', [
  'engagementTypeCode',
])
export class CraneEngagementTypeMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_engagement_type_masters_id_pk',
  })
  id: string;

  @Column({ name: 'engagement_type_code', type: 'int' })
  engagementTypeCode: number;

  @Column({ name: 'engagement_type_name', type: 'varchar', length: 150 })
  engagementTypeName: string;

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
