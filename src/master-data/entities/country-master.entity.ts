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
 * Country / jurisdiction options for the contact form.
 * `officeCode` decides which office owns an enquiry from this country,
 * which in turn drives the SLA clock (each office has its own working week).
 */
@Entity({ name: 'country_masters' })
@Unique('vtx_country_masters_country_code_unique', ['countryCode'])
export class CountryMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_country_masters_id_pk',
  })
  id: string;

  @Column({ name: 'country_code', type: 'int' })
  countryCode: number;

  @Column({ name: 'country_name', type: 'varchar', length: 100 })
  countryName: string;

  /** ISO 3166-1 alpha-2 where one applies. Null for groupings like "EU". */
  @Column({ name: 'iso_code', type: 'varchar', length: 2, nullable: true })
  isoCode: string | null;

  /** Owning office for enquiries from this country. */
  @Column({ name: 'office_code', type: 'int' })
  officeCode: number;

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
