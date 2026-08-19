import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Access regime. Affects lead time more than almost anything else here — an Aramco SAES site means weeks of clearance before anyone reaches the crane. */
@Entity({ name: 'crane_site_access_masters' })
@Unique('vtx_crane_site_access_masters_site_access_code_unique', [
  'siteAccessCode',
])
export class CraneSiteAccessMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_site_access_masters_id_pk',
  })
  id: string;

  @Column({ name: 'site_access_code', type: 'int' })
  siteAccessCode: number;

  @Column({ name: 'site_access_name', type: 'varchar', length: 150 })
  siteAccessName: string;

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
