import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** "When do you need this?" options on the contact form. */
@Entity({ name: 'enquiry_timeline_masters' })
@Unique('vtx_enquiry_timeline_masters_timeline_code_unique', ['timelineCode'])
export class EnquiryTimelineMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_enquiry_timeline_masters_id_pk',
  })
  id: string;

  @Column({ name: 'timeline_code', type: 'int' })
  timelineCode: number;

  @Column({ name: 'timeline_name', type: 'varchar', length: 100 })
  timelineName: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
  })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
