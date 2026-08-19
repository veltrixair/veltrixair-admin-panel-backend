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
import { IndustryMaster } from '../../../master-data/entities/industry-master.entity';
import { SiteMaster } from '../../../master-data/entities/site-master.entity';
import { CraneAccessApprovalMaster } from '../../masters/entities/crane-access-approval-master.entity';
import { CraneAgeBandMaster } from '../../masters/entities/crane-age-band-master.entity';
import { CraneEngagementTypeMaster } from '../../masters/entities/crane-engagement-type-master.entity';
import { CraneEngineerVisaMaster } from '../../masters/entities/crane-engineer-visa-master.entity';
import { CraneEnvironmentMaster } from '../../masters/entities/crane-environment-master.entity';
import { CraneHotWorkMaster } from '../../masters/entities/crane-hot-work-master.entity';
import { CraneLeadSourceMaster } from '../../masters/entities/crane-lead-source-master.entity';
import { CraneOemMaster } from '../../masters/entities/crane-oem-master.entity';
import { CranePpeProviderMaster } from '../../masters/entities/crane-ppe-provider-master.entity';
import { CraneServiceLineMaster } from '../../masters/entities/crane-service-line-master.entity';
import { CraneSiteAccessMaster } from '../../masters/entities/crane-site-access-master.entity';
import { CraneSiteCityMaster } from '../../masters/entities/crane-site-city-master.entity';
import { CraneTranslatorMaster } from '../../masters/entities/crane-translator-master.entity';
import { CraneTypeMaster } from '../../masters/entities/crane-type-master.entity';
import { CraneVisitDurationMaster } from '../../masters/entities/crane-visit-duration-master.entity';
import { CraneVisitPurposeMaster } from '../../masters/entities/crane-visit-purpose-master.entity';
import { CraneVisitTimeMaster } from '../../masters/entities/crane-visit-time-master.entity';
import { CraneVisitUrgencyMaster } from '../../masters/entities/crane-visit-urgency-master.entity';
import { CraneQuoteRequest } from '../../quote/entities/crane-quote-request.entity';

export const VISIT_STATUSES = [
  'NEW',
  'COORDINATING',
  'SCHEDULED',
  'COMPLETED',
  'REPORT_SENT',
  'CANCELLED',
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/**
 * The fourth option differs from the quote form's: someone requesting a visit
 * may be actively comparing suppliers, which is commercially useful to know.
 */
export const VISIT_EXISTING_CLIENT = [
  'NO',
  'ACTIVE_AMC',
  'PAST_PROJECTS',
  'EVALUATING',
] as const;
export type VisitExistingClient = (typeof VISIT_EXISTING_CLIENT)[number];

/**
 * A request for an engineer to attend a site.
 *
 * "Bring an engineer, before we bring a quote." Most arrive cold from the
 * page, so `quoteId` is nullable — it is set when a visit is scoped out of an
 * enquiry that already exists.
 *
 * `mobile`, `siteContactPhone` and `siteAddress` are `select: false`: a list of
 * visits is a list of industrial sites and the people who let you into them,
 * which is not something a table view needs to carry.
 */
@Entity({ name: 'crane_site_visits' })
@Unique('vtx_crane_site_visits_reference_no_unique', ['referenceNo'])
@Unique('vtx_crane_site_visits_manage_token_unique', ['manageToken'])
export class CraneSiteVisit {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_site_visits_id_pk',
  })
  id: string;

  /** VTX-VST-2026-0042, issued within the hour as the page promises. */
  @Index('idx_crane_site_visits_reference_no')
  @Column({ name: 'reference_no', type: 'varchar', length: 30 })
  referenceNo: string;

  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @ManyToOne(() => SiteMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'site_code',
    referencedColumnName: 'siteCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_site_code_fk',
  })
  site?: SiteMaster;

  /** Set when the visit was scoped out of an existing quote enquiry. */
  @Index('idx_crane_site_visits_quote_id')
  @Column({ name: 'quote_id', type: 'uuid', nullable: true })
  quoteId: string | null;

  @ManyToOne(() => CraneQuoteRequest, { onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'quote_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_crane_site_visits_quote_id_fk',
  })
  quote?: CraneQuoteRequest;

  // --- Section 01: visit purpose ------------------------------------------

  @Column({ name: 'visit_purpose_code', type: 'int' })
  visitPurposeCode: number;

  @ManyToOne(() => CraneVisitPurposeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'visit_purpose_code',
    referencedColumnName: 'visitPurposeCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_visit_purpose_code_fk',
  })
  visitPurpose?: CraneVisitPurposeMaster;

  @Column({ name: 'service_line_code', type: 'int', nullable: true })
  serviceLineCode: number | null;

  @ManyToOne(() => CraneServiceLineMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'service_line_code',
    referencedColumnName: 'serviceLineCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_service_line_code_fk',
  })
  serviceLine?: CraneServiceLineMaster;

  @Column({ name: 'visit_urgency_code', type: 'int' })
  visitUrgencyCode: number;

  @ManyToOne(() => CraneVisitUrgencyMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'visit_urgency_code',
    referencedColumnName: 'visitUrgencyCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_visit_urgency_code_fk',
  })
  visitUrgency?: CraneVisitUrgencyMaster;

  /** The one required free-text field: what the engineer should look at. */
  @Column({ name: 'engineer_focus', type: 'varchar', length: 5000 })
  engineerFocus: string;

  // --- Section 02: company and contact ------------------------------------

  @Column({ name: 'company_name', type: 'varchar', length: 200 })
  companyName: string;

  @Column({ name: 'industry_code', type: 'int' })
  industryCode: number;

  @ManyToOne(() => IndustryMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'industry_code',
    referencedColumnName: 'industryCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_industry_code_fk',
  })
  industry?: IndustryMaster;

  @Column({ name: 'contact_name', type: 'varchar', length: 150 })
  contactName: string;

  @Column({
    name: 'contact_position',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  contactPosition: string | null;

  @Index('idx_crane_site_visits_email')
  @Column({ name: 'business_email', type: 'varchar', length: 255 })
  businessEmail: string;

  @Column({ name: 'mobile', type: 'varchar', length: 30, select: false })
  mobile: string;

  @Column({ name: 'existing_client', type: 'varchar', length: 20 })
  existingClient: VisitExistingClient;

  @Column({ name: 'lead_source_code', type: 'int', nullable: true })
  leadSourceCode: number | null;

  @ManyToOne(() => CraneLeadSourceMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'lead_source_code',
    referencedColumnName: 'leadSourceCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_lead_source_code_fk',
  })
  leadSource?: CraneLeadSourceMaster;

  // --- Section 03: site and asset snapshot --------------------------------

  @Column({ name: 'site_city_code', type: 'int' })
  siteCityCode: number;

  @ManyToOne(() => CraneSiteCityMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'site_city_code',
    referencedColumnName: 'siteCityCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_site_city_code_fk',
  })
  siteCity?: CraneSiteCityMaster;

  @Column({ name: 'site_access_code', type: 'int', nullable: true })
  siteAccessCode: number | null;

  @ManyToOne(() => CraneSiteAccessMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'site_access_code',
    referencedColumnName: 'siteAccessCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_site_access_code_fk',
  })
  siteAccess?: CraneSiteAccessMaster;

  @Column({
    name: 'site_address',
    type: 'varchar',
    length: 500,
    nullable: true,
    select: false,
  })
  siteAddress: string | null;

  @Column({
    name: 'site_contact_name',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  siteContactName: string | null;

  @Column({
    name: 'site_contact_phone',
    type: 'varchar',
    length: 30,
    nullable: true,
    select: false,
  })
  siteContactPhone: string | null;

  @Column({ name: 'crane_count', type: 'int', nullable: true })
  craneCount: number | null;

  @Column({ name: 'crane_type_code', type: 'int', nullable: true })
  craneTypeCode: number | null;

  @ManyToOne(() => CraneTypeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'crane_type_code',
    referencedColumnName: 'craneTypeCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_crane_type_code_fk',
  })
  craneType?: CraneTypeMaster;

  @Column({ name: 'oem_code', type: 'int', nullable: true })
  oemCode: number | null;

  @ManyToOne(() => CraneOemMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'oem_code',
    referencedColumnName: 'oemCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_oem_code_fk',
  })
  oem?: CraneOemMaster;

  @Column({ name: 'age_band_code', type: 'int', nullable: true })
  ageBandCode: number | null;

  @ManyToOne(() => CraneAgeBandMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'age_band_code',
    referencedColumnName: 'ageBandCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_age_band_code_fk',
  })
  ageBand?: CraneAgeBandMaster;

  @Column({ name: 'environment_code', type: 'int', nullable: true })
  environmentCode: number | null;

  @ManyToOne(() => CraneEnvironmentMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'environment_code',
    referencedColumnName: 'environmentCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_environment_code_fk',
  })
  environment?: CraneEnvironmentMaster;

  // --- Section 04: scheduling ---------------------------------------------

  /** Free text on purpose — "after Eid" and "w/c 14th" are both real answers. */
  @Column({
    name: 'preferred_dates',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  preferredDates: string | null;

  @Column({ name: 'avoid_dates', type: 'varchar', length: 300, nullable: true })
  avoidDates: string | null;

  @Column({ name: 'visit_duration_code', type: 'int', nullable: true })
  visitDurationCode: number | null;

  @ManyToOne(() => CraneVisitDurationMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'visit_duration_code',
    referencedColumnName: 'visitDurationCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_visit_duration_code_fk',
  })
  visitDuration?: CraneVisitDurationMaster;

  @Column({ name: 'visit_time_code', type: 'int', nullable: true })
  visitTimeCode: number | null;

  @ManyToOne(() => CraneVisitTimeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'visit_time_code',
    referencedColumnName: 'visitTimeCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_visit_time_code_fk',
  })
  visitTime?: CraneVisitTimeMaster;

  @Column({ name: 'attendees', type: 'varchar', length: 2000, nullable: true })
  attendees: string | null;

  @Column({
    name: 'agenda_items',
    type: 'varchar',
    length: 3000,
    nullable: true,
  })
  agendaItems: string | null;

  // --- Section 05: access and compliance ----------------------------------

  @Column({ name: 'access_approval_code', type: 'int', nullable: true })
  accessApprovalCode: number | null;

  @ManyToOne(() => CraneAccessApprovalMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'access_approval_code',
    referencedColumnName: 'accessApprovalCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_access_approval_code_fk',
  })
  accessApproval?: CraneAccessApprovalMaster;

  @Column({ name: 'engineer_visa_code', type: 'int', nullable: true })
  engineerVisaCode: number | null;

  @ManyToOne(() => CraneEngineerVisaMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'engineer_visa_code',
    referencedColumnName: 'engineerVisaCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_engineer_visa_code_fk',
  })
  engineerVisa?: CraneEngineerVisaMaster;

  @Column({ name: 'ppe_provider_code', type: 'int', nullable: true })
  ppeProviderCode: number | null;

  @ManyToOne(() => CranePpeProviderMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'ppe_provider_code',
    referencedColumnName: 'ppeProviderCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_ppe_provider_code_fk',
  })
  ppeProvider?: CranePpeProviderMaster;

  @Column({ name: 'hot_work_code', type: 'int', nullable: true })
  hotWorkCode: number | null;

  @ManyToOne(() => CraneHotWorkMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'hot_work_code',
    referencedColumnName: 'hotWorkCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_hot_work_code_fk',
  })
  hotWork?: CraneHotWorkMaster;

  @Column({ name: 'translator_code', type: 'int', nullable: true })
  translatorCode: number | null;

  @ManyToOne(() => CraneTranslatorMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'translator_code',
    referencedColumnName: 'translatorCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_translator_code_fk',
  })
  translator?: CraneTranslatorMaster;

  /** Whether anyone is paying — a real commercial field, not a formality. */
  @Column({ name: 'engagement_type_code', type: 'int', nullable: true })
  engagementTypeCode: number | null;

  @ManyToOne(() => CraneEngagementTypeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'engagement_type_code',
    referencedColumnName: 'engagementTypeCode',
    foreignKeyConstraintName: 'vtx_crane_site_visits_engagement_type_code_fk',
  })
  engagementType?: CraneEngagementTypeMaster;

  @Column({
    name: 'site_constraints',
    type: 'varchar',
    length: 3000,
    nullable: true,
  })
  siteConstraints: string | null;

  // --- Pipeline -----------------------------------------------------------

  @Index('idx_crane_site_visits_status')
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'NEW' })
  status: VisitStatus;

  @Column({
    name: 'assigned_engineer',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  assignedEngineer: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ name: 'manage_token', type: 'varchar', length: 64, select: false })
  manageToken: string;

  // --- The promises printed on the page -----------------------------------

  /** "Within 48 hours" for the engineer coordination call. */
  @Column({ name: 'coordination_due_at', type: 'timestamptz' })
  coordinationDueAt: Date;

  /** "Within 5 working days" for the assessment report. */
  @Column({ name: 'report_due_at', type: 'timestamptz' })
  reportDueAt: Date;

  @Column({ name: 'first_responded_at', type: 'timestamptz', nullable: true })
  firstRespondedAt: Date | null;

  // --- Consent and provenance ---------------------------------------------

  @Column({ name: 'consent_at', type: 'timestamptz' })
  consentAt: Date;

  @Column({ name: 'privacy_notice_version', type: 'varchar', length: 50 })
  privacyNoticeVersion: string;

  /**
   * Separate from the primary consent: whether the assessment may include
   * photographs and operational observations. On an Aramco or defence site
   * that is a materially different question from data processing.
   */
  @Column({ name: 'photography_consent', type: 'boolean', default: false })
  photographyConsent: boolean;

  @Column({ name: 'marketing_opt_in', type: 'boolean', default: false })
  marketingOptIn: boolean;

  @Column({ name: 'source_page', type: 'varchar', length: 500, nullable: true })
  sourcePage: string | null;

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
    select: false,
  })
  userAgent: string | null;

  @Column({ name: 'spam_score', type: 'int', default: 0 })
  spamScore: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
