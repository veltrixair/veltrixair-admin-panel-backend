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
 * The part of the business that owns a crane role.
 *
 * Not the same thing as a career track, and deliberately a separate table. A
 * track is what a candidate picks on the careers page — which is why the
 * graduate programme and the speculative pile are tracks. A department is
 * where the headcount sits: Erection & Installation, QHSE, and so on.
 */
@Entity({ name: 'crane_department_masters' })
@Unique('vtx_crane_department_masters_code_uq', ['departmentCode'])
export class CraneDepartmentMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_department_masters_id_pk',
  })
  id: string;

  @Column({ name: 'site_code', type: 'int', default: 102 })
  siteCode: number;

  @Column({ name: 'department_code', type: 'int' })
  departmentCode: number;

  @Column({ name: 'department_name', type: 'varchar', length: 150 })
  departmentName: string;

  /**
   * The tag the job list prints — ER, SV, IN, OP, QH, PR.
   *
   * Stored rather than derived from the name: "Inspection & Load Testing" and
   * "Installation" both initial to IN, and this is what people read on a dense
   * table.
   */
  @Column({ name: 'abbreviation', type: 'varchar', length: 4 })
  abbreviation: string;

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
