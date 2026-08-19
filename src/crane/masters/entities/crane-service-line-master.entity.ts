import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** The six service lines the quote form offers, plus the strategic catch-all. */
@Entity({ name: 'crane_service_line_masters' })
@Unique('vtx_crane_service_line_masters_service_line_code_unique', [
  'serviceLineCode',
])
export class CraneServiceLineMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_service_line_masters_id_pk',
  })
  id: string;

  @Column({ name: 'service_line_code', type: 'int' })
  serviceLineCode: number;

  @Column({ name: 'service_line_name', type: 'varchar', length: 120 })
  serviceLineName: string;

  /** The catalogue number the public site prints — "VTX-CRN-01". */
  @Column({ name: 'public_code', type: 'varchar', length: 20, nullable: true })
  publicCode: string | null;

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
