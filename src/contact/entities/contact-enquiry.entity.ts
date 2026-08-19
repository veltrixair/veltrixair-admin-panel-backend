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
import { CountryMaster } from '../../master-data/entities/country-master.entity';
import { EnquiryTimelineMaster } from '../../master-data/entities/enquiry-timeline-master.entity';
import { EnquiryTopicMaster } from '../../master-data/entities/enquiry-topic-master.entity';
import { IndustryMaster } from '../../master-data/entities/industry-master.entity';
import { OfficeMaster } from '../../master-data/entities/office-master.entity';

export const ENQUIRY_STATUSES = [
  'NEW',
  'QUALIFYING',
  'ENGAGED',
  'WON',
  'LOST',
  'SPAM',
] as const;

export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/**
 * A submission from the "Send Us a Detailed Enquiry" form on /contact-us/.
 *
 * Note the `select: false` columns. `message`, `phone` and `ipHash` are the
 * personal-data fields; excluding them by default inverts the risk so a list
 * query has to *ask* for them rather than leak them by omission.
 */
@Entity({ name: 'contact_enquiries' })
@Unique('vtx_contact_enquiries_reference_no_unique', ['referenceNo'])
export class ContactEnquiry {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_contact_enquiries_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  /** Shown to the submitter on success, e.g. "VLX-2026-000412". */
  @Column({ name: 'reference_no', type: 'varchar', length: 30 })
  referenceNo: string;

  // --- Form fields -------------------------------------------------------

  @Index('idx_contact_enquiries_topic_code')
  @Column({ name: 'topic_code', type: 'int' })
  topicCode: number;

  @ManyToOne(() => EnquiryTopicMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'topic_code',
    referencedColumnName: 'topicCode',
    foreignKeyConstraintName: 'vtx_contact_enquiries_topic_code_fk',
  })
  topic?: EnquiryTopicMaster;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  @Column({ name: 'company', type: 'varchar', length: 150 })
  company: string;

  @Column({ name: 'role_title', type: 'varchar', length: 150, nullable: true })
  roleTitle: string | null;

  @Index('idx_contact_enquiries_work_email')
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

  @Index('idx_contact_enquiries_country_code')
  @Column({ name: 'country_code', type: 'int' })
  countryCode: number;

  @ManyToOne(() => CountryMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'country_code',
    referencedColumnName: 'countryCode',
    foreignKeyConstraintName: 'vtx_contact_enquiries_country_code_fk',
  })
  country?: CountryMaster;

  @Column({ name: 'industry_code', type: 'int', nullable: true })
  industryCode: number | null;

  @ManyToOne(() => IndustryMaster, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({
    name: 'industry_code',
    referencedColumnName: 'industryCode',
    foreignKeyConstraintName: 'vtx_contact_enquiries_industry_code_fk',
  })
  industry?: IndustryMaster;

  @Column({ name: 'timeline_code', type: 'int', nullable: true })
  timelineCode: number | null;

  @ManyToOne(() => EnquiryTimelineMaster, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({
    name: 'timeline_code',
    referencedColumnName: 'timelineCode',
    foreignKeyConstraintName: 'vtx_contact_enquiries_timeline_code_fk',
  })
  timeline?: EnquiryTimelineMaster;

  /** Capped at 1500 characters to match the form's counter. */
  @Column({ name: 'message', type: 'varchar', length: 1500, select: false })
  message: string;

  /**
   * "This enquiry includes confidential information. Please send a mutual NDA
   * before we go further." When true the message body must never be placed in
   * a notification email or chat payload.
   */
  @Column({ name: 'requires_nda', type: 'boolean', default: false })
  requiresNda: boolean;

  // --- Consent -----------------------------------------------------------

  @Column({ name: 'consent_at', type: 'timestamptz' })
  consentAt: Date;

  @Column({ name: 'privacy_notice_version', type: 'varchar', length: 50 })
  privacyNoticeVersion: string;

  // --- Routing and SLA ---------------------------------------------------

  @Index('idx_contact_enquiries_office_code')
  @Column({ name: 'office_code', type: 'int' })
  officeCode: number;

  @ManyToOne(() => OfficeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'office_code',
    referencedColumnName: 'officeCode',
    foreignKeyConstraintName: 'vtx_contact_enquiries_office_code_fk',
  })
  office?: OfficeMaster;

  @Column({ name: 'routed_to_email', type: 'varchar', length: 255 })
  routedToEmail: string;

  /** End of business on the next working day *for the owning office*. */
  @Column({ name: 'sla_due_at', type: 'timestamptz' })
  slaDueAt: Date;

  @Column({ name: 'first_responded_at', type: 'timestamptz', nullable: true })
  firstRespondedAt: Date | null;

  @Index('idx_contact_enquiries_status')
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'NEW' })
  status: EnquiryStatus;

  @Column({
    name: 'assigned_to',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  assignedTo: string | null;

  // --- Provenance --------------------------------------------------------

  @Column({
    name: 'source_page',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
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

  /** HMAC of the submitter's IP — never the raw address. */
  @Column({
    name: 'ip_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
    select: false,
  })
  ipHash: string | null;

  @Column({
    name: 'user_agent',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  userAgent: string | null;

  @Column({ name: 'spam_score', type: 'int', default: 0 })
  spamScore: number;

  // --- Housekeeping ------------------------------------------------------

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Index('idx_contact_enquiries_created_date')
  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
