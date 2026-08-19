import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StoredFile } from './stored-file.entity';

/**
 * A lead captured in exchange for a gated file.
 *
 * Whitepapers and the capability statement are lead-generation assets — the
 * download is the exchange. Kept separate from `contact_enquiries` because the
 * intent differs: this is interest, not a request for contact, and conflating
 * them would put people into the enquiry SLA who never asked to be called.
 */
@Entity({ name: 'asset_download_requests' })
export class AssetDownloadRequest {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_asset_download_requests_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Index('idx_asset_download_requests_file_id')
  @Column({ name: 'file_id', type: 'uuid' })
  fileId: string;

  @ManyToOne(() => StoredFile, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'file_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_asset_download_requests_file_id_fk',
  })
  file?: StoredFile;

  /** What the visitor was looking at — an article slug, or a page path. */
  @Column({ name: 'context', type: 'varchar', length: 200, nullable: true })
  context: string | null;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  @Column({ name: 'company', type: 'varchar', length: 150 })
  company: string;

  @Column({ name: 'role_title', type: 'varchar', length: 150, nullable: true })
  roleTitle: string | null;

  @Index('idx_asset_download_requests_work_email')
  @Column({ name: 'work_email', type: 'varchar', length: 255 })
  workEmail: string;

  @Column({ name: 'consent_at', type: 'timestamptz' })
  consentAt: Date;

  @Column({ name: 'privacy_notice_version', type: 'varchar', length: 50 })
  privacyNoticeVersion: string;

  // --- Provenance --------------------------------------------------------

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

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
