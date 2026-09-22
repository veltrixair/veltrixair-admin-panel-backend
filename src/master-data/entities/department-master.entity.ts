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
 * Which part of the company someone works in.
 *
 * A master rather than free text, for the reason every other list here is one:
 * typed departments drift within a week — "Sales", "sales", "Sales Team" — and
 * a filter over them then quietly returns a third of the people it should.
 *
 * No `site_code`, unlike most masters. A department is a company-wide fact:
 * Finance is Finance whether someone administers the IT dashboard or the crane
 * one, and a person may hold badges on several brands at once. Which brands
 * someone belongs to is recorded in `admin_roles` and nowhere else.
 */
@Entity({ name: 'department_masters' })
@Unique('vtx_department_masters_code_unique', ['departmentCode'])
export class DepartmentMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_department_masters_id_pk',
  })
  id: string;

  @Column({ name: 'department_code', type: 'int' })
  departmentCode: number;

  @Column({ name: 'department_name', type: 'varchar', length: 100 })
  departmentName: string;

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
