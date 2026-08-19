import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { OfficeMaster } from '../../../master-data/entities/office-master.entity';
import { PrivacyJurisdictionMaster } from '../../masters/entities/privacy-jurisdiction-master.entity';
import { PrivacyServiceMaster } from '../../masters/entities/privacy-service-master.entity';

export const PRIVACY_ENQUIRY_STATUSES = [
  'NEW',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'SPAM',
] as const;

export type PrivacyEnquiryStatus = (typeof PRIVACY_ENQUIRY_STATUSES)[number];

export const PRIVACY_LAWFUL_BASES = ['CONSENT', 'LEGITIMATE_INTEREST'] as const;

export type PrivacyLawfulBasis = (typeof PRIVACY_LAWFUL_BASES)[number];

/**
 * A submission from the "Brief the practice" form on dataprivacy.veltrixair.com.
 *
 * On its own table rather than sharing `contact_enquiries`, because the privacy
 * intake is expected to diverge — the shared table is shaped around sales leads
 * and this one is free to grow towards whatever the practice actually receives.
 *
 * Note the `select: false` columns. `brief`, `phone` and `ipHash` are the
 * personal-data fields, and the brief is the most sensitive free text on any of
 * the three sites: a privacy brief routinely names data subjects, systems and
 * incidents. Excluding them by default inverts the risk, so a list query has to
 * ask for them rather than leak them by omission.
 */
@Entity({ name: 'privacy_contact_enquiries' })
@Unique('vtx_privacy_contact_enquiries_reference_no_uq', ['referenceNo'])
export class PrivacyContactEnquiry {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_privacy_contact_enquiries_id_pk',
  })
  id: string;

  /**
   * Always 103 today. Kept so admin filtering goes through the same choke point
   * as every other module rather than this one being the exception.
   */
  @Index('idx_privacy_contact_enquiries_site_code')
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  /** VDP-ENQ-2026-0001 */
  @Column({ name: 'reference_no', type: 'varchar', length: 30 })
  referenceNo: string;

  // --- Who ---------------------------------------------------------------

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  @Column({ name: 'organisation', type: 'varchar', length: 150 })
  organisation: string;

  @Column({ name: 'work_email', type: 'varchar', length: 255 })
  workEmail: string;

  @Column({
    name: 'phone',
    type: 'varchar',
    length: 32,
    nullable: true,
    select: false,
  })
  phone: string | null;

  @Column({ name: 'role_title', type: 'varchar', length: 150, nullable: true })
  roleTitle: string | null;

  // --- What --------------------------------------------------------------

  @Index('idx_privacy_contact_enquiries_jurisdiction')
  @Column({ name: 'jurisdiction_code', type: 'int' })
  jurisdictionCode: number;

  @ManyToOne(() => PrivacyJurisdictionMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'jurisdiction_code',
    referencedColumnName: 'jurisdictionCode',
    foreignKeyConstraintName:
      'vtx_privacy_contact_enquiries_jurisdiction_code_fk',
  })
  jurisdiction?: PrivacyJurisdictionMaster;

  @Index('idx_privacy_contact_enquiries_service')
  @Column({ name: 'service_code', type: 'int' })
  serviceCode: number;

  @ManyToOne(() => PrivacyServiceMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'service_code',
    referencedColumnName: 'serviceCode',
    foreignKeyConstraintName: 'vtx_privacy_contact_enquiries_service_code_fk',
  })
  service?: PrivacyServiceMaster;

  /** "Brief the practice" — capped to match the form's counter. */
  @Column({ name: 'brief', type: 'varchar', length: 2000, select: false })
  brief: string;

  // --- Lawful basis ------------------------------------------------------

  /**
   * Why the practice is allowed to hold these details.
   *
   * LEGITIMATE_INTEREST today: the form has no consent tick, because answering
   * a business enquiry is a pre-contractual step under PDPL, GDPR and DPDP
   * alike, and a consent record would document the wrong thing. Recorded
   * explicitly rather than assumed, so the file states its own basis.
   */
  @Column({
    name: 'lawful_basis',
    type: 'varchar',
    length: 30,
    default: 'LEGITIMATE_INTEREST',
  })
  lawfulBasis: PrivacyLawfulBasis;

  /**
   * Null while the basis is not consent. A CHECK constraint enforces the other
   * direction — a row claiming CONSENT must carry the timestamp proving it. The
   * column exists so that the day a privacy form does need consent for
   * something, it is not a migration.
   */
  @Column({ name: 'consent_at', type: 'timestamptz', nullable: true })
  consentAt: Date | null;

  /** Which version of the notice was on screen when they submitted. */
  @Column({ name: 'privacy_notice_version', type: 'varchar', length: 50 })
  privacyNoticeVersion: string;

  // --- Routing and SLA ---------------------------------------------------

  @Column({ name: 'office_code', type: 'int' })
  officeCode: number;

  @ManyToOne(() => OfficeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'office_code',
    referencedColumnName: 'officeCode',
    foreignKeyConstraintName: 'vtx_privacy_contact_enquiries_office_code_fk',
  })
  office?: OfficeMaster;

  @Column({ name: 'routed_to_email', type: 'varchar', length: 255 })
  routedToEmail: string;

  /** One working day, on the owning office's calendar — as the page promises. */
  @Column({ name: 'sla_due_at', type: 'timestamptz' })
  slaDueAt: Date;

  @Column({ name: 'first_responded_at', type: 'timestamptz', nullable: true })
  firstRespondedAt: Date | null;

  // --- Pipeline ----------------------------------------------------------

  @Index('idx_privacy_contact_enquiries_status')
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'NEW' })
  status: PrivacyEnquiryStatus;

  @Column({ name: 'assigned_to', type: 'varchar', length: 150, nullable: true })
  assignedTo: string | null;

  /**
   * Set with `assignedTo` and cleared with it, which a CHECK constraint
   * enforces. Held as a column rather than read off the timeline so "how long
   * has this sat with this practitioner" is a query and a sortable admin
   * column, not a scan of events per record.
   */
  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  // --- Provenance and anti-spam ------------------------------------------

  @Column({ name: 'source_page', type: 'varchar', length: 500, nullable: true })
  sourcePage: string | null;

  @Column({ name: 'utm_source', type: 'varchar', length: 100, nullable: true })
  utmSource: string | null;

  @Column({ name: 'utm_medium', type: 'varchar', length: 100, nullable: true })
  utmMedium: string | null;

  @Column({
    name: 'utm_campaign',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  utmCampaign: string | null;

  @Column({
    name: 'ip_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
    select: false,
  })
  ipHash: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ name: 'spam_score', type: 'int', default: 0 })
  spamScore: number;

  // --- Housekeeping ------------------------------------------------------

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Index('idx_privacy_contact_enquiries_created')
  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
