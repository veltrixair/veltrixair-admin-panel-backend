import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StoredFile } from '../../files/entities/stored-file.entity';
import { ArticleTopicMaster } from '../../master-data/entities/article-topic-master.entity';
import { ArticleTypeMaster } from '../../master-data/entities/article-type-master.entity';
import { RegionMaster } from '../../master-data/entities/region-master.entity';

export const ARTICLE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/** Whitepapers are measured in pages; everything else in minutes. */
export const READING_UNITS = ['MINUTES', 'PAGES'] as const;
export type ReadingUnit = (typeof READING_UNITS)[number];

/**
 * A card on /insights/.
 *
 * This is card metadata only — there is deliberately no body column. Article
 * bodies and detail pages are out of scope for now; the site links cards with
 * hash anchors rather than to individual URLs.
 */
@Entity({ name: 'articles' })
/*
 * Scoped to the brand, and only while the article is live.
 *
 * Global uniqueness meant IT and Crane could never share a slug, and a
 * soft-deleted article held on to its own forever — blocking a name whose
 * owner is invisible in the admin panel. The partial index releases a slug
 * the moment its article is removed, without rewriting the deleted row.
 */
@Index('vtx_articles_site_slug_unique', ['siteCode', 'slug'], {
  unique: true,
  where: '"is_deleted" = false',
})
export class Article {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_articles_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  /** Matches the anchor already used on the site, e.g. "sovereign-k8s-gcc-bank". */
  @Column({ name: 'slug', type: 'varchar', length: 200 })
  slug: string;

  @Column({ name: 'title', type: 'varchar', length: 300 })
  title: string;

  /** Short description under the title. Null until the content team writes it. */
  @Column({ name: 'dek', type: 'varchar', length: 600, nullable: true })
  dek: string | null;

  /** Attribution as printed on the card — a person, a practice, or a team. */
  @Column({ name: 'author_name', type: 'varchar', length: 150 })
  authorName: string;

  // --- Taxonomy ----------------------------------------------------------

  @Index('idx_articles_type_code')
  @Column({ name: 'type_code', type: 'int' })
  typeCode: number;

  @ManyToOne(() => ArticleTypeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'type_code',
    referencedColumnName: 'typeCode',
    foreignKeyConstraintName: 'vtx_articles_type_code_fk',
  })
  type?: ArticleTypeMaster;

  @Index('idx_articles_topic_code')
  @Column({ name: 'topic_code', type: 'int' })
  topicCode: number;

  @ManyToOne(() => ArticleTopicMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'topic_code',
    referencedColumnName: 'topicCode',
    foreignKeyConstraintName: 'vtx_articles_topic_code_fk',
  })
  topic?: ArticleTopicMaster;

  /** An article can span regions — "KSA & India" is a real case. */
  @ManyToMany(() => RegionMaster)
  @JoinTable({
    name: 'article_regions',
    joinColumn: {
      name: 'article_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'vtx_article_regions_article_id_fk',
    },
    inverseJoinColumn: {
      name: 'region_code',
      referencedColumnName: 'regionCode',
      foreignKeyConstraintName: 'vtx_article_regions_region_code_fk',
    },
  })
  regions: RegionMaster[];

  // --- Reading time ------------------------------------------------------

  @Column({ name: 'reading_value', type: 'int' })
  readingValue: number;

  @Column({
    name: 'reading_unit',
    type: 'varchar',
    length: 10,
    default: 'MINUTES',
  })
  readingUnit: ReadingUnit;

  /**
   * Normalised for the "Reading time" sort, which has to order "14 min" and
   * "32 pages" against each other. Pages are converted on write.
   */
  @Index('idx_articles_estimated_minutes')
  @Column({ name: 'estimated_minutes', type: 'int' })
  estimatedMinutes: number;

  /**
   * The downloadable asset, for Whitepapers.
   *
   * Null on the other types — an Insight or Case Study is read on the page.
   * Whitepaper cards advertise "PDF · N pages", so a whitepaper without this
   * set is promising a file that does not exist; `assetPending` on the card
   * makes that visible rather than silently linking nowhere.
   */
  @Index('idx_articles_asset_file_id')
  @Column({ name: 'asset_file_id', type: 'uuid', nullable: true })
  assetFileId: string | null;

  @ManyToOne(() => StoredFile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'asset_file_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_articles_asset_file_id_fk',
  })
  assetFile?: StoredFile | null;

  // --- Presentation ------------------------------------------------------

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  // --- Lifecycle ---------------------------------------------------------

  @Index('idx_articles_status')
  @Column({ name: 'status', type: 'varchar', length: 10, default: 'DRAFT' })
  status: ArticleStatus;

  @Index('idx_articles_published_at')
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
