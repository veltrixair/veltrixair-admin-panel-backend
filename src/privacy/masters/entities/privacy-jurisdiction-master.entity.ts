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
 * The regulatory regimes offered on the privacy contact form.
 *
 * Deliberately not `country_masters`: half these options are not countries.
 * "EU / UK — GDPR" spans many, "Multi-jurisdiction" names none, and
 * "Qatar / Kuwait / Bahrain" is a grouping. What the practice needs to know is
 * which law applies, not where the client is registered.
 *
 * `officeCode` plays the role it plays on a country — it decides which office
 * owns the enquiry, and therefore which working week the response clock runs
 * on. Riyadh is Sunday to Thursday, the India office Monday to Friday.
 */
@Entity({ name: 'privacy_jurisdiction_masters' })
@Unique('vtx_privacy_jurisdiction_masters_code_uq', ['jurisdictionCode'])
export class PrivacyJurisdictionMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_privacy_jurisdiction_masters_id_pk',
  })
  id: string;

  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'jurisdiction_code', type: 'int' })
  jurisdictionCode: number;

  @Column({ name: 'jurisdiction_name', type: 'varchar', length: 120 })
  jurisdictionName: string;

  /** The law itself — PDPL, GDPR, DPDP Act 2023. Shown beside the name. */
  @Column({ name: 'regulation', type: 'varchar', length: 60 })
  regulation: string;

  @Column({ name: 'office_code', type: 'int' })
  officeCode: number;

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
