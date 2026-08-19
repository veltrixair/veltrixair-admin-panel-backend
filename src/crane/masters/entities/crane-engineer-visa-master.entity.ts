import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** What paperwork the attending engineer needs. */
@Entity({ name: 'crane_engineer_visa_masters' })
@Unique('vtx_crane_engineer_visa_masters_engineer_visa_code_unique', [
  'engineerVisaCode',
])
export class CraneEngineerVisaMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_engineer_visa_masters_id_pk',
  })
  id: string;

  @Column({ name: 'engineer_visa_code', type: 'int' })
  engineerVisaCode: number;

  @Column({ name: 'engineer_visa_name', type: 'varchar', length: 150 })
  engineerVisaName: string;

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
