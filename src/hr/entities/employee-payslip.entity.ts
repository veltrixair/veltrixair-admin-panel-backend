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
 * One month's payslip.
 *
 * `period_month` is the first of the month it covers, not the day it was
 * issued — a slip for March raised in April is a March slip, and sorting or
 * finding one by issue date would put it in the wrong year every January.
 * UNIQUE with the employee, because a month cannot be paid twice.
 *
 * Retention is 84 months, set on the file rather than here. Seven years covers
 * the longest ordinary tax window across the three jurisdictions the company
 * operates in, and the clock starting at upload is right for payslips
 * specifically: one arrives each month, so each file's retention runs from
 * roughly its own period. Onboarding documents deliberately have none, because
 * theirs would have to run from the end of employment.
 */
@Entity({ name: 'employee_payslips' })
@Unique('vtx_employee_payslips_unique', ['employeeId', 'periodMonth'])
export class EmployeePayslip {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_employee_payslips_id_pk',
  })
  id: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, (employee) => employee.payslips, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'employee_id',
    foreignKeyConstraintName: 'vtx_employee_payslips_employee_id_fk',
  })
  employee?: Employee;

  /** The first of the month covered, e.g. 2026-03-01 for March. */
  @Column({ name: 'period_month', type: 'date' })
  periodMonth: string;

  @Column({ name: 'file_id', type: 'uuid', nullable: true })
  fileId: string | null;

  @ManyToOne(() => StoredFile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'file_id',
    foreignKeyConstraintName: 'vtx_employee_payslips_file_id_fk',
  })
  file?: StoredFile | null;

  @Column({
    name: 'net_pay',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  netPay: string | null;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt: Date;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
