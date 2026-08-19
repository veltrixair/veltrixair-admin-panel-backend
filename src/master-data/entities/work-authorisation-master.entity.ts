import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Right-to-work status. Matters more here than at most firms: hiring spans Riyadh, Dubai and Bangalore, and job postings already carry a visaSponsorship flag. */
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
