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
 * Right-to-work status. Matters more here than at most firms: hiring spans
 * Riyadh, Dubai and Bangalore, so what an applicant is already entitled to do
 * is a real question rather than a formality. It is asked of the candidate —
 * postings no longer carry a sponsorship flag of their own.
 */
@Entity({ name: 'work_authorisation_masters' })
@Unique('vtx_work_authorisation_masters_work_authorisation_code_unique', [
  'workAuthorisationCode',
])
export class WorkAuthorisationMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_work_authorisation_masters_id_pk',
  })
  id: string;

  @Column({ name: 'work_authorisation_code', type: 'int' })
  workAuthorisationCode: number;

  @Column({ name: 'work_authorisation_name', type: 'varchar', length: 120 })
  workAuthorisationName: string;

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
