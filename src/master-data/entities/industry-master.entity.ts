import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Industry options — shared by the contact form, careers and insights filters. */
@Entity({ name: 'industry_masters' })
@Unique('vtx_industry_masters_industry_code_unique', ['industryCode'])
export class IndustryMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_industry_masters_id_pk',
  })
  id: string;

  @Column({ name: 'industry_code', type: 'int' })
  industryCode: number;

  @Column({ name: 'industry_name', type: 'varchar', length: 100 })
  industryName: string;

  /** Which brand's list this belongs to. IT uses 1xx codes, cranes 2xx. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

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
