import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * "What's this about?" options on the contact form.
 * `routeEmail` is the inbox an enquiry of this topic is delivered to —
 * kept in data rather than a switch statement because routing changes.
 */
@Entity({ name: 'enquiry_topic_masters' })
@Unique('vtx_enquiry_topic_masters_topic_code_unique', ['topicCode'])
export class EnquiryTopicMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_enquiry_topic_masters_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'topic_code', type: 'int' })
  topicCode: number;

  @Column({ name: 'topic_name', type: 'varchar', length: 100 })
  topicName: string;

  @Column({ name: 'route_email', type: 'varchar', length: 255 })
  routeEmail: string;

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
