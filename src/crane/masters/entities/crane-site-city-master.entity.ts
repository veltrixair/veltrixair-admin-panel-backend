import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** KSA cities and giga-projects where a site could be. Drives mobilisation. */
@Entity({ name: 'crane_site_city_masters' })
@Unique('vtx_crane_site_city_masters_site_city_code_unique', ['siteCityCode'])
export class CraneSiteCityMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_site_city_masters_id_pk',
  })
  id: string;

  @Column({ name: 'site_city_code', type: 'int' })
  siteCityCode: number;

  @Column({ name: 'site_city_name', type: 'varchar', length: 120 })
  siteCityName: string;

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
