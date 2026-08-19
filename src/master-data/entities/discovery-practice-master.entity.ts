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
 * "Pick a practice" on /talk-to-architect/ — Custom Software, Platform
 * Engineering, Cybersecurity & SOC, Data Privacy, Business Apps, AI & Voice.
 *
 * Deliberately its own list. The careers filter (`practice_area_masters`) has
 * eight entries with different names, and insights topics a third set again.
 * They overlap but are not the same taxonomy, and merging them would mean a
 * change on one page silently reshaping another.
 */
@Entity({ name: 'discovery_practice_masters' })
@Unique('vtx_discovery_practice_masters_practice_code_unique', ['practiceCode'])
export class DiscoveryPracticeMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_discovery_practice_masters_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'practice_code', type: 'int' })
  practiceCode: number;

  @Column({ name: 'practice_name', type: 'varchar', length: 100 })
  practiceName: string;

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
