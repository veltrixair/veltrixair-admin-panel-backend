import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Required completion window. */
@Entity({ name: 'crane_completion_timeline_masters' })
@Unique(
  'vtx_crane_completion_timeline_masters_completion_timeline_code_unique',
  ['completionTimelineCode'],
)
export class CraneCompletionTimelineMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_completion_timeline_masters_id_pk',
  })
  id: string;

  @Column({ name: 'completion_timeline_code', type: 'int' })
  completionTimelineCode: number;

  @Column({ name: 'completion_timeline_name', type: 'varchar', length: 120 })
  completionTimelineName: string;

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
