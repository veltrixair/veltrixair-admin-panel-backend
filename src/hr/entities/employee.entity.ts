import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DepartmentMaster } from '../../master-data/entities/department-master.entity';
import { OfficeMaster } from '../../master-data/entities/office-master.entity';
import { EmployeeDocument } from './employee-document.entity';
import { EmployeePayslip } from './employee-payslip.entity';

/**
 * The four an administrator may choose.
 *
 * ON_HOLD is the one a document count could never express: the file is
 * neither moving nor finished, and nobody should be chasing it — a visa, a
 * background check, a joiner who has not started yet.
 */
export const ONBOARDING_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERN',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** Where the work happens, which is no longer the same question as which office. */
export const WORK_MODES = ['REMOTE', 'ONSITE', 'HYBRID'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

/**
 * A person the company employs.
 *
 * The person of record, and deliberately independent of `admins`. An account is
 * a grant of access, not a fact about someone: a field engineer or a payroll
 * clerk is employed here whether or not they ever open the panel, and their
 * employment record has to outlive any login they may or may not be given.
 *
 * This replaces `admin_profiles`, which could only describe somebody who
 * already had credentials. That table's own comment already said a profile
 * "belongs to the person"; it simply could not act on it while hanging off an
 * account.
 *
 * Scoped by `employerSiteCode` — deliberately not called `siteCode`. Every
 * other table uses that name for "which dashboard owns this record"; here the
 * question is "which unit employs this person", which is a fact about their
 * contract. Which dashboards they may open is separate and plural, and stays
 * in `admin_roles`: the root account holds badges on all three brands while
 * being employed by one. Naming them alike is how someone would later filter
 * access by the wrong column.
 */
@Entity({ name: 'employees' })
@Unique('vtx_employees_employee_code_unique', ['employeeCode'])
@Unique('vtx_employees_work_email_unique', ['workEmail'])
export class Employee {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_employees_id_pk',
  })
  id: string;

  /** Which unit employs them. NOT which dashboards they can reach. */
  @Index('idx_employees_employer_site_code')
  @Column({ name: 'employer_site_code', type: 'int' })
  employerSiteCode: number;

  /** VTX-EMP-0001 — issued server-side, in the house format. */
  @Column({ name: 'employee_code', type: 'varchar', length: 30 })
  employeeCode: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  /**
   * The authoritative address. When this person is later given a login, the
   * account takes its email from here, so the two cannot drift apart.
   */
  @Column({ name: 'work_email', type: 'varchar', length: 255 })
  workEmail: string;

  /** Where offer letters and payslips go once somebody has left. */
  @Column({ name: 'personal_email', type: 'varchar', length: 255, nullable: true })
  personalEmail: string | null;

  @Column({ name: 'mobile', type: 'varchar', length: 32, nullable: true })
  mobile: string | null;

  /** "Senior Account Manager". Free text — job titles do not enumerate. */
  @Column({ name: 'designation', type: 'varchar', length: 150 })
  designation: string;

  @Index('idx_employees_department_code')
  @Column({ name: 'department_code', type: 'int' })
  departmentCode: number;

  @ManyToOne(() => DepartmentMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'department_code',
    referencedColumnName: 'departmentCode',
    foreignKeyConstraintName: 'vtx_employees_department_code_fk',
  })
  department?: DepartmentMaster;

  @Column({ name: 'employment_type', type: 'varchar', length: 20 })
  employmentType: EmploymentType;

  /**
   * Independent of `officeCode`.
   *
   * Somebody remote still belongs to an office — it decides their working week
   * and public holidays, which is what the business-hours calculations read.
   */
  @Column({ name: 'work_mode', type: 'varchar', length: 10, default: 'ONSITE' })
  workMode: WorkMode;

  @Column({ name: 'office_code', type: 'int', nullable: true })
  officeCode: number | null;

  @ManyToOne(() => OfficeMaster, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({
    name: 'office_code',
    referencedColumnName: 'officeCode',
    foreignKeyConstraintName: 'vtx_employees_office_code_fk',
  })
  office?: OfficeMaster | null;

  @Column({ name: 'joining_date', type: 'date', nullable: true })
  joiningDate: string | null;

  /**
   * Person to person, not account to account.
   *
   * A manager may have no login of their own — that is the whole point of
   * separating the two — so a reporting line drawn between accounts would be
   * unrepresentable for exactly the people it matters most for.
   */
  @Index('idx_employees_reporting_to')
  @Column({ name: 'reporting_to', type: 'uuid', nullable: true })
  reportingTo: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'reporting_to',
    foreignKeyConstraintName: 'vtx_employees_reporting_to_fk',
  })
  manager?: Employee | null;

  /**
   * Read only by HR and Super Admin — `FEATURE.HR` exists to separate this
   * from account administration, which is a different power.
   */
  @Column({ name: 'monthly_net_pay', type: 'numeric', precision: 12, scale: 2, nullable: true })
  monthlyNetPay: string | null;

  /**
   * Where this person is in onboarding, as somebody decided — not as the
   * document counts imply.
   *
   * It used to be neither stored nor decided: the panel read "all documents
   * verified" as complete and everything else as in progress, which made the
   * status a second rendering of the counts beside it and could not say that
   * a file is parked, or finished because a requirement was waived.
   *
   * The counts are still there and still useful. They are just no longer the
   * thing that answers this question.
   */
  @Index('idx_employees_onboarding_status')
  @Column({
    name: 'onboarding_status',
    type: 'varchar',
    length: 20,
    default: 'NOT_STARTED',
  })
  onboardingStatus: OnboardingStatus;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => EmployeeDocument, (doc) => doc.employee)
  documents?: EmployeeDocument[];

  @OneToMany(() => EmployeePayslip, (slip) => slip.employee)
  payslips?: EmployeePayslip[];

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
