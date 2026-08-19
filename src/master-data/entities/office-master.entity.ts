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
 * Offices are not just "contact us" display data — they are the input to the
 * SLA clock. Riyadh works Sun–Thu, Dubai and Bangalore work Mon–Fri, and all
 * three sit on different offsets, so "one business day" resolves differently
 * depending on which office owns the enquiry.
 */
@Entity({ name: 'office_masters' })
@Unique('vtx_office_masters_office_code_unique', ['officeCode'])
export class OfficeMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_office_masters_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'office_code', type: 'int' })
  officeCode: number;

  @Column({ name: 'office_name', type: 'varchar', length: 100 })
  officeName: string;

  @Column({ name: 'city', type: 'varchar', length: 100 })
  city: string;

  @Column({ name: 'country_name', type: 'varchar', length: 100 })
  countryName: string;

  @Column({ name: 'address', type: 'varchar', length: 500 })
  address: string;

  @Column({ name: 'email', type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'phone', type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  /** IANA timezone, e.g. "Asia/Riyadh". */
  @Column({ name: 'timezone', type: 'varchar', length: 64 })
  timezone: string;

  /**
   * Working weekdays as JS day numbers (0 = Sunday … 6 = Saturday).
   * Riyadh: [0,1,2,3,4] · Dubai & Bangalore: [1,2,3,4,5]
   */
  @Column({ name: 'working_days', type: 'int', array: true })
  workingDays: number[];

  @Column({ name: 'work_start_hour', type: 'int', default: 9 })
  workStartHour: number;

  @Column({ name: 'work_end_hour', type: 'int', default: 18 })
  workEndHour: number;

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
