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
 * A Veltrixair business. One backend serves all of them.
 *
 * `adminDomain` is where the dashboard is served after sign-in, and what a
 * token's site claim is checked against — a token minted for IT arriving at
 * crane.veltrixair.com is rejected outright.
 *
 * `publicDomain` is how an anonymous contact form works out which brand it
 * belongs to, since the public sites carry no token to read a scope from.
 */
@Entity({ name: 'site_masters' })
@Unique('vtx_site_masters_site_code_unique', ['siteCode'])
@Unique('vtx_site_masters_slug_unique', ['slug'])
@Unique('vtx_site_masters_admin_domain_unique', ['adminDomain'])
export class SiteMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_site_masters_id_pk',
  })
  id: string;

  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'site_name', type: 'varchar', length: 100 })
  siteName: string;

  @Column({ name: 'slug', type: 'varchar', length: 60 })
  slug: string;

  @Column({ name: 'admin_domain', type: 'varchar', length: 255 })
  adminDomain: string;

  @Column({
    name: 'public_domain',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  publicDomain: string | null;

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
