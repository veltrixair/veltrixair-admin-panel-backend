import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Preferred payment terms. */
@Entity({ name: 'crane_payment_terms_masters' })
@Unique('vtx_crane_payment_terms_masters_payment_terms_code_unique', [
  'paymentTermsCode',
])
export class CranePaymentTermsMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_payment_terms_masters_id_pk',
  })
  id: string;

  @Column({ name: 'payment_terms_code', type: 'int' })
  paymentTermsCode: number;

  @Column({ name: 'payment_terms_name', type: 'varchar', length: 120 })
  paymentTermsName: string;

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
