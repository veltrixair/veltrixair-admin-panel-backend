import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export const FILE_PURPOSES = [
  'WHITEPAPER',
  'CAPABILITY_STATEMENT',
  'RESUME',
  'QUOTE_ATTACHMENT',
] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

export const SCAN_STATUSES = [
  'PENDING',
  'CLEAN',
  'INFECTED',
  'FAILED',
] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

/**
 * Registry of every stored object.
 *
 * The reference backend returns a storage key and lets the caller keep it,
 * with no central record. That cannot work here: retention purges and erasure
 * requests both need to enumerate what exists, and an object nobody has a row
 * for is an object nobody can delete on request.
 */
@Entity({ name: 'stored_files' })
@Unique('vtx_stored_files_storage_key_unique', ['storageKey'])
export class StoredFile {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_stored_files_id_pk',
  })
  id: string;

  /** Server-generated object key. Never derived from the client filename. */
  @Column({ name: 'storage_key', type: 'varchar', length: 300 })
  storageKey: string;

  @Column({ name: 'storage_driver', type: 'varchar', length: 20 })
  storageDriver: string;

  /** Kept for display and Content-Disposition only — never used as a path. */
  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  /** Lets a later re-upload be recognised as the same bytes. */
  @Column({ name: 'checksum_sha256', type: 'varchar', length: 64 })
  checksumSha256: string;

  /**
   * Which brand this object belongs to. Required — the column is NOT NULL, so
   * an upload that cannot say which brand it is for has nowhere to go.
   */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  /** Drives size caps, accepted formats, retention and download policy. */
  @Index('idx_stored_files_purpose')
  @Column({ name: 'purpose', type: 'varchar', length: 30 })
  purpose: FilePurpose;

  @Index('idx_stored_files_scan_status')
  @Column({
    name: 'scan_status',
    type: 'varchar',
    length: 10,
    default: 'PENDING',
  })
  scanStatus: ScanStatus;

  @Column({ name: 'scanned_at', type: 'timestamptz', nullable: true })
  scannedAt: Date | null;

  /** The signed-in admin's email, or null for files written by a job. */
  @Column({ name: 'uploaded_by', type: 'varchar', length: 150, nullable: true })
  uploadedBy: string | null;

  /** Null means keep indefinitely — marketing assets rather than personal data. */
  @Index('idx_stored_files_retention_until')
  @Column({ name: 'retention_until', type: 'timestamptz', nullable: true })
  retentionUntil: Date | null;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
