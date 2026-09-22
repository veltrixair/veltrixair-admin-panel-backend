import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { StoredFile } from '../../files/entities/stored-file.entity';
import { Employee } from './employee.entity';

/**
 * The eight documents a personnel file is made of, in the order the panel
 * shows them. Career history first, identity second — the same split the
 * screen draws.
 */
export const DOCUMENT_TYPES = [
  'CV',
  'EDUCATION',
  'EXPERIENCE',
  'OFFER',
  'AADHAAR',
  'PAN',
  'PHOTO',
  'BANK',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ['VERIFIED', 'PENDING', 'MISSING'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Which half of the file a document belongs to. Presentation, not storage. */
export const DOCUMENT_GROUP: Record<DocumentType, 'CAREER' | 'IDENTITY'> = {
  CV: 'CAREER',
  EDUCATION: 'CAREER',
  EXPERIENCE: 'CAREER',
  OFFER: 'CAREER',
  AADHAAR: 'IDENTITY',
  PAN: 'IDENTITY',
  PHOTO: 'IDENTITY',
  BANK: 'IDENTITY',
};

export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  CV: 'Resume / CV',
  EDUCATION: 'Education certificates',
  EXPERIENCE: 'Experience / relieving letter',
  OFFER: 'Signed offer letter',
  AADHAAR: 'Aadhaar card',
  PAN: 'PAN card',
  PHOTO: 'Passport-size photo',
  BANK: 'Bank proof / cancelled cheque',
};

/**
 * One document slot on one person's file.
 *
 * All eight rows exist from the moment an employee is created, sitting at
 * MISSING. A file is a checklist, and a checklist with items that only appear
 * once they are done cannot be read for what is outstanding — which is the
 * only question anyone asks of it.
 *
 * The file itself lives in `stored_files`, so uploads, magic-byte checking and
 * retention are the module that already does those things. Detaching leaves
 * the row and clears `file_id`, returning the slot to MISSING.
 */
@Entity({ name: 'employee_documents' })
@Unique('vtx_employee_documents_unique', ['employeeId', 'docType'])
export class EmployeeDocument {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_employee_documents_id_pk',
  })
  id: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, (employee) => employee.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'employee_id',
    foreignKeyConstraintName: 'vtx_employee_documents_employee_id_fk',
  })
  employee?: Employee;

  @Column({ name: 'doc_type', type: 'varchar', length: 20 })
  docType: DocumentType;

  @Column({ name: 'file_id', type: 'uuid', nullable: true })
  fileId: string | null;

  @ManyToOne(() => StoredFile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'file_id',
    foreignKeyConstraintName: 'vtx_employee_documents_file_id_fk',
  })
  file?: StoredFile | null;

  /**
   * MISSING until a file arrives, PENDING once one has, VERIFIED when somebody
   * has actually looked at it. The middle state is the point: an uploaded
   * document is not a checked one.
   */
  @Column({ name: 'status', type: 'varchar', length: 10, default: 'MISSING' })
  status: DocumentStatus;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  /** Who signed it off, by email — the record outlives their account. */
  @Column({ name: 'verified_by', type: 'varchar', length: 255, nullable: true })
  verifiedBy: string | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
