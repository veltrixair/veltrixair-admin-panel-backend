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
 * TOPIC filter row on /insights/ — Software, Platform, Cybersecurity,
 * Data Privacy, AI & ML, Business Apps, Growth.
 *
 * Deliberately separate from `practice_area_masters`, which drives the careers
 * filter: the two lists overlap but are not the same, and coupling them would
 * mean a careers change silently reshaping the insights filter.
 */
@Entity({ name: 'article_topic_masters' })
@Unique('vtx_article_topic_masters_topic_code_unique', ['topicCode'])
export class ArticleTopicMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_article_topic_masters_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'topic_code', type: 'int' })
  topicCode: number;

  @Column({ name: 'topic_name', type: 'varchar', length: 100 })
  topicName: string;

  @Column({ name: 'slug', type: 'varchar', length: 100 })
  slug: string;

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
