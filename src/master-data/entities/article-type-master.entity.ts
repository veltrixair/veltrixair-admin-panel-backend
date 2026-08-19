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
 * TYPE filter row on /insights/ — Insight, Case Study, Whitepaper,
 * Regulatory Update, Perspective.
 *
 * Each type carries a colour because the filter chips and the card badges are
 * colour-coded. Serving it from the API keeps the frontend from hardcoding a
 * palette that then drifts from the data.
 */
@Entity({ name: 'article_type_masters' })
@Unique('vtx_article_type_masters_type_code_unique', ['typeCode'])
export class ArticleTypeMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_article_type_masters_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'type_code', type: 'int' })
  typeCode: number;

  @Column({ name: 'type_name', type: 'varchar', length: 100 })
  typeName: string;

  @Column({ name: 'slug', type: 'varchar', length: 100 })
  slug: string;

  /** Badge / chip colour, e.g. "#1E3A8A". Approximate until brand values land. */
  @Column({ name: 'colour_hex', type: 'varchar', length: 7, nullable: true })
  colourHex: string | null;

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
