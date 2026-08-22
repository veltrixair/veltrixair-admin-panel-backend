import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { StoredFile } from '../../../files/entities/stored-file.entity';
import { IndustryMaster } from '../../../master-data/entities/industry-master.entity';
import { SiteMaster } from '../../../master-data/entities/site-master.entity';
import { CraneBudgetBandMaster } from '../../masters/entities/crane-budget-band-master.entity';
import { CraneCompletionTimelineMaster } from '../../masters/entities/crane-completion-timeline-master.entity';
import { CraneDutyClassMaster } from '../../masters/entities/crane-duty-class-master.entity';
import { CraneEnvironmentMaster } from '../../masters/entities/crane-environment-master.entity';
import { CraneLeadSourceMaster } from '../../masters/entities/crane-lead-source-master.entity';
import { CraneOemMaster } from '../../masters/entities/crane-oem-master.entity';
import { CranePaymentTermsMaster } from '../../masters/entities/crane-payment-terms-master.entity';
import { CraneProcurementMaster } from '../../masters/entities/crane-procurement-master.entity';
import { CraneProposalDocMaster } from '../../masters/entities/crane-proposal-doc-master.entity';
import { CraneServiceLineMaster } from '../../masters/entities/crane-service-line-master.entity';
import { CraneSiteAccessMaster } from '../../masters/entities/crane-site-access-master.entity';
import { CraneSiteCityMaster } from '../../masters/entities/crane-site-city-master.entity';
import { CraneTypeMaster } from '../../masters/entities/crane-type-master.entity';
import { CraneUrgencyMaster } from '../../masters/entities/crane-urgency-master.entity';

export const QUOTE_STATUSES = [
  'NEW',
  'TRIAGE',
  'SITE_VISIT',
  'PROPOSAL_SENT',
  'WON',
  'LOST',
  /**
   * "Reverted back" — the request came back to us after a proposal went out,
   * and needs rework before it can move again.
   *
   * Deliberately NOT terminal, which is what separates it from WITHDRAWN: a
   * reverted quote is still live and can be moved to any other status, whereas
   * a withdrawn one is finished for good. It also stops the triage clock, on
   * the grounds that someone has plainly engaged with it by this point.
   */
  'REVERTED',
  'WITHDRAWN',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const EXISTING_CLIENT = [
  'NO',
  'ACTIVE_AMC',
  'PAST_PROJECTS',
  'UNSURE',
] as const;
export type ExistingClient = (typeof EXISTING_CLIENT)[number];

export const PREFERRED_CONTACT = [
  'EMAIL',
  'PHONE',
  'WHATSAPP',
  'SITE_VISIT',
  'VIDEO',
] as const;
export type PreferredContact = (typeof PREFERRED_CONTACT)[number];

/**
 * A request for a crane quote.
 *
 * Commercially the most sensitive record in the system — it carries a
 * customer's budget envelope, payment terms and named contacts, and a
 * competitor would find the pipeline very interesting. `mobile`,
 * `budgetBandCode`, `paymentTermsCode` and `constraintsConcerns` are
 * `select: false`, so a list endpoint cannot leak them by omission.
 *
 * `scopeDetail` holds section 04 — see crane-quote.constants.ts for why it is
 * JSON and what validates it.
 */
@Entity({ name: 'crane_quote_requests' })
@Unique('vtx_crane_quote_requests_reference_no_unique', ['referenceNo'])
@Unique('vtx_crane_quote_requests_manage_token_unique', ['manageToken'])
export class CraneQuoteRequest {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_quote_requests_id_pk',
  })
  id: string;

  /** Quoted back within the hour, as the page promises. VTX-RFQ-2026-0042. */
  @Index('idx_crane_quote_requests_reference_no')
  @Column({ name: 'reference_no', type: 'varchar', length: 30 })
  referenceNo: string;

  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @ManyToOne(() => SiteMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'site_code',
    referencedColumnName: 'siteCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_site_code_fk',
  })
  site?: SiteMaster;

  // --- Section 01: service required --------------------------------------

  @Column({ name: 'service_line_code', type: 'int' })
  serviceLineCode: number;

  @ManyToOne(() => CraneServiceLineMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'service_line_code',
    referencedColumnName: 'serviceLineCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_service_line_code_fk',
  })
  serviceLine?: CraneServiceLineMaster;

  /** Extra service lines ticked alongside the primary one. */
  @ManyToMany(() => CraneServiceLineMaster)
  @JoinTable({
    name: 'crane_quote_additional_services',
    joinColumn: { name: 'quote_id', referencedColumnName: 'id' },
    inverseJoinColumn: {
      name: 'service_line_code',
      referencedColumnName: 'serviceLineCode',
    },
  })
  additionalServices?: CraneServiceLineMaster[];

  @Column({ name: 'urgency_code', type: 'int' })
  urgencyCode: number;

  @ManyToOne(() => CraneUrgencyMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'urgency_code',
    referencedColumnName: 'urgencyCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_urgency_code_fk',
  })
  urgency?: CraneUrgencyMaster;

  @Column({ name: 'lead_source_code', type: 'int', nullable: true })
  leadSourceCode: number | null;

  @ManyToOne(() => CraneLeadSourceMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'lead_source_code',
    referencedColumnName: 'leadSourceCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_lead_source_code_fk',
  })
  leadSource?: CraneLeadSourceMaster;

  // --- Section 02: company and contact -----------------------------------

  @Column({ name: 'company_name', type: 'varchar', length: 200 })
  companyName: string;

  @Column({ name: 'industry_code', type: 'int' })
  industryCode: number;

  @ManyToOne(() => IndustryMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'industry_code',
    referencedColumnName: 'industryCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_industry_code_fk',
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

  @Index('idx_crane_quote_requests_email')
  @Column({ name: 'business_email', type: 'varchar', length: 255 })
  businessEmail: string;

  /** WhatsApp preferred, per the form. Held back from list responses. */
  @Column({ name: 'mobile', type: 'varchar', length: 30, select: false })
  mobile: string;

  @Column({ name: 'existing_client', type: 'varchar', length: 20 })
  existingClient: ExistingClient;

  @Column({ name: 'preferred_contact', type: 'varchar', length: 20 })
  preferredContact: PreferredContact;

  // --- Section 03: site and asset ----------------------------------------

  @Column({ name: 'site_city_code', type: 'int' })
  siteCityCode: number;

  @ManyToOne(() => CraneSiteCityMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'site_city_code',
    referencedColumnName: 'siteCityCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_site_city_code_fk',
  })
  siteCity?: CraneSiteCityMaster;

  @Column({ name: 'site_access_code', type: 'int', nullable: true })
  siteAccessCode: number | null;

  @ManyToOne(() => CraneSiteAccessMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'site_access_code',
    referencedColumnName: 'siteAccessCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_site_access_code_fk',
  })
  siteAccess?: CraneSiteAccessMaster;

  @Column({ name: 'crane_count', type: 'int', nullable: true })
  craneCount: number | null;

  @Column({ name: 'crane_type_code', type: 'int' })
  craneTypeCode: number;

  @ManyToOne(() => CraneTypeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'crane_type_code',
    referencedColumnName: 'craneTypeCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_crane_type_code_fk',
  })
  craneType?: CraneTypeMaster;

  @Column({ name: 'oem_code', type: 'int' })
  oemCode: number;

  @ManyToOne(() => CraneOemMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'oem_code',
    referencedColumnName: 'oemCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_oem_code_fk',
  })
  oem?: CraneOemMaster;

  /**
   * Safe working load, as written — "32 t", or "10 + 20 + 32 t" for a request
   * covering several cranes.
   *
   * Text rather than a number, because `craneCount` on this same form is
   * routinely more than one and a numeric column could hold only a single
   * capacity. It matches `spanLiftHeight` below, which has always been text
   * for the same reason. Nothing reads this value, so there is no arithmetic
   * to give up.
   */
  @Column({
    name: 'swl_tonnes',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  swlTonnes: string | null;

  @Column({ name: 'year_of_manufacture', type: 'int', nullable: true })
  yearOfManufacture: number | null;

  @Column({ name: 'environment_code', type: 'int' })
  environmentCode: number;

  @ManyToOne(() => CraneEnvironmentMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'environment_code',
    referencedColumnName: 'environmentCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_environment_code_fk',
  })
  environment?: CraneEnvironmentMaster;

  @Column({
    name: 'span_lift_height',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  spanLiftHeight: string | null;

  @Column({ name: 'duty_class_code', type: 'int', nullable: true })
  dutyClassCode: number | null;

  @ManyToOne(() => CraneDutyClassMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'duty_class_code',
    referencedColumnName: 'dutyClassCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_duty_class_code_fk',
  })
  dutyClass?: CraneDutyClassMaster;

  // --- Section 04: the service-specific questionnaire --------------------

  @Column({ name: 'scope_detail', type: 'jsonb', nullable: true })
  scopeDetail: Record<string, unknown> | null;

  // --- Section 05: commercial context ------------------------------------

  /** Withheld from lists — a budget envelope is not table-of-results data. */
  @Column({
    name: 'budget_band_code',
    type: 'int',
    nullable: true,
    select: false,
  })
  budgetBandCode: number | null;

  @ManyToOne(() => CraneBudgetBandMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'budget_band_code',
    referencedColumnName: 'budgetBandCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_budget_band_code_fk',
  })
  budgetBand?: CraneBudgetBandMaster;

  @Column({ name: 'completion_timeline_code', type: 'int', nullable: true })
  completionTimelineCode: number | null;

  @ManyToOne(() => CraneCompletionTimelineMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'completion_timeline_code',
    referencedColumnName: 'completionTimelineCode',
    foreignKeyConstraintName:
      'vtx_crane_quote_requests_completion_timeline_code_fk',
  })
  completionTimeline?: CraneCompletionTimelineMaster;

  @Column({ name: 'procurement_code', type: 'int', nullable: true })
  procurementCode: number | null;

  @ManyToOne(() => CraneProcurementMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'procurement_code',
    referencedColumnName: 'procurementCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_procurement_code_fk',
  })
  procurement?: CraneProcurementMaster;

  @Column({
    name: 'payment_terms_code',
    type: 'int',
    nullable: true,
    select: false,
  })
  paymentTermsCode: number | null;

  @ManyToOne(() => CranePaymentTermsMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'payment_terms_code',
    referencedColumnName: 'paymentTermsCode',
    foreignKeyConstraintName: 'vtx_crane_quote_requests_payment_terms_code_fk',
  })
  paymentTerms?: CranePaymentTermsMaster;

  @ManyToMany(() => CraneProposalDocMaster)
  @JoinTable({
    name: 'crane_quote_required_documents',
    joinColumn: { name: 'quote_id', referencedColumnName: 'id' },
    inverseJoinColumn: {
      name: 'proposal_doc_code',
      referencedColumnName: 'proposalDocCode',
    },
  })
  requiredDocuments?: CraneProposalDocMaster[];

  @Column({ name: 'project_description', type: 'varchar', length: 5000 })
  projectDescription: string;

  @Column({
    name: 'constraints_concerns',
    type: 'varchar',
    length: 5000,
    nullable: true,
    select: false,
  })
  constraintsConcerns: string | null;

  /** Drawings, capacity plates, inspection certificates. */
  @ManyToMany(() => StoredFile)
  @JoinTable({
    name: 'crane_quote_attachments',
    joinColumn: { name: 'quote_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'file_id', referencedColumnName: 'id' },
  })
  attachments?: StoredFile[];

  // --- Pipeline -----------------------------------------------------------

  /**
   * Derived at submit from urgency and, where present, the breakdown answer.
   * A real column rather than a JSON key because the queue is sorted by it.
   */
  @Column({ name: 'priority', type: 'varchar', length: 10, default: 'P4' })
  priority: 'P1' | 'P2' | 'P3' | 'P4';

  @Index('idx_crane_quote_requests_status')
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'NEW' })
  status: QuoteStatus;

  @Column({ name: 'assigned_to', type: 'varchar', length: 150, nullable: true })
  assignedTo: string | null;

  @Column({ name: 'manage_token', type: 'varchar', length: 64, select: false })
  manageToken: string;

  // --- The promises printed beside the form ------------------------------

  @Column({ name: 'triage_due_at', type: 'timestamptz' })
  triageDueAt: Date;

  @Column({ name: 'site_visit_due_at', type: 'timestamptz' })
  siteVisitDueAt: Date;

  @Column({ name: 'proposal_due_at', type: 'timestamptz' })
  proposalDueAt: Date;

  /** Stops the triage clock. Set on the first move off NEW. */
  @Column({ name: 'first_responded_at', type: 'timestamptz', nullable: true })
  firstRespondedAt: Date | null;

  // --- Consent and provenance --------------------------------------------

  @Column({ name: 'consent_at', type: 'timestamptz' })
  consentAt: Date;

  @Column({ name: 'privacy_notice_version', type: 'varchar', length: 50 })
  privacyNoticeVersion: string;

  /** The separate, optional quarterly regulatory update. */
  @Column({ name: 'marketing_opt_in', type: 'boolean', default: false })
  marketingOptIn: boolean;

  @Column({ name: 'marketing_opt_in_at', type: 'timestamptz', nullable: true })
  marketingOptInAt: Date | null;

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
