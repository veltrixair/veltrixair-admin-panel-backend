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
 * The domains an architect works in.
 *
 * Its own list rather than a share of `industry_masters`, which answers a
 * different question. That one asks a visitor what business they are in —
 * Banking & Finance, Government & Public Sector, Healthcare — and is used to
 * route their enquiry. This one says what an architect does: Data Privacy,
 * Enterprise Software, Design Solution. The words overlap in places and the
 * meanings do not, so merging them would put "Hotel Management" in front of a
 * bank filling in the contact form.
 *
 * Replaces the discovery practice list, which asked roughly this question of
 * an architect but was answered by the visitor instead.
 */
@Entity({ name: 'architect_industry_masters' })
@Unique('vtx_architect_industry_masters_code_unique', ['industryCode'])
export class ArchitectIndustryMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_architect_industry_masters_id_pk',
  })
  id: string;

  @Column({ name: 'industry_code', type: 'int' })
  industryCode: number;

  @Column({ name: 'industry_name', type: 'varchar', length: 100 })
  industryName: string;

  /** Which brand's list this belongs to. IT uses 1xx codes. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

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
