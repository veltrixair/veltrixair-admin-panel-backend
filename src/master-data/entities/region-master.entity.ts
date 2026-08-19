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
 * REGION filter row on /insights/ — KSA, GCC, India, Global.
 *
 * These are editorial regions, not the operating jurisdictions in
 * `country_masters`: an article can be tagged "GCC" or "Global", neither of
 * which is a country.
 */
@Entity({ name: 'region_masters' })
@Unique('vtx_region_masters_region_code_unique', ['regionCode'])
export class RegionMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_region_masters_id_pk',
  })
  id: string;

  @Column({ name: 'region_code', type: 'int' })
  regionCode: number;

  @Column({ name: 'region_name', type: 'varchar', length: 100 })
  regionName: string;

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
