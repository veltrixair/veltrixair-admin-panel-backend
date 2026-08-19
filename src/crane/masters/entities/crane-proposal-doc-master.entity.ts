import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** What the customer wants included in the proposal pack. */
@Entity({ name: 'crane_proposal_doc_masters' })
@Unique('vtx_crane_proposal_doc_masters_proposal_doc_code_unique', [
  'proposalDocCode',
])
export class CraneProposalDocMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_proposal_doc_masters_id_pk',
  })
  id: string;

  @Column({ name: 'proposal_doc_code', type: 'int' })
  proposalDocCode: number;

  @Column({ name: 'proposal_doc_name', type: 'varchar', length: 150 })
  proposalDocName: string;

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
