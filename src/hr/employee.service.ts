import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { DepartmentMaster } from '../master-data/entities/department-master.entity';
import { OfficeMaster } from '../master-data/entities/office-master.entity';
import { Admin } from '../auth/entities/admin.entity';
import {
  CreateEmployeeDto,
  CreatePayslipDto,
  ListEmployeesDto,
  UpdateEmployeeDto,
  UpsertDocumentDto,
} from './dto/employee.dto';
import {
  DOCUMENT_TYPES,
  EmployeeDocument,
} from './entities/employee-document.entity';
import type { DocumentType } from './entities/employee-document.entity';
import { EmployeePayslip } from './entities/employee-payslip.entity';
import { EMPLOYMENT_TYPES, Employee, WORK_MODES } from './entities/employee.entity';

/** What the onboarding form renders its dropdowns from. */
export interface EmployeeOptions {
  departments: { code: number; name: string }[];
  offices: { code: number; name: string; city: string; country: string }[];
  employmentTypes: string[];
  workModes: string[];
  /** Anyone already filed can be somebody's manager. */
  managers: { id: string; name: string; designation: string }[];
}

/** A row in the list, with the counts the screen shows without opening anyone. */
export interface EmployeeRow extends Employee {
  documentsVerified: number;
  documentsTotal: number;
  payslipCount: number;
  hasAccount: boolean;
}

@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(EmployeeDocument)
    private readonly documentRepo: Repository<EmployeeDocument>,
    @InjectRepository(EmployeePayslip)
    private readonly payslipRepo: Repository<EmployeePayslip>,
    @InjectRepository(DepartmentMaster)
    private readonly departmentRepo: Repository<DepartmentMaster>,
    @InjectRepository(OfficeMaster)
    private readonly officeRepo: Repository<OfficeMaster>,
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    private readonly dataSource: DataSource,
  ) {}

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  async list(
    query: ListEmployeesDto,
    actorSite: number,
  ): Promise<PaginatedResult<EmployeeRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.employeeRepo
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.office', 'office')
      .where('employee.isDeleted = false')
      // A personnel file carries a mobile number, a bank proof and a salary.
      // It does not travel between brands.
      .andWhere('employee.employerSiteCode = :actorSite', { actorSite });

    if (query.search) {
      qb.andWhere(
        '(employee.fullName ILIKE :q OR employee.workEmail ILIKE :q ' +
          'OR employee.employeeCode ILIKE :q OR employee.designation ILIKE :q)',
        { q: `%${query.search}%` },
      );
    }
    if (query.departmentCode !== undefined) {
      qb.andWhere('employee.departmentCode = :dept', { dept: query.departmentCode });
    }
    if (query.employmentType) {
      qb.andWhere('employee.employmentType = :type', { type: query.employmentType });
    }
    if (query.workMode) {
      qb.andWhere('employee.workMode = :mode', { mode: query.workMode });
    }
    if (query.onboardingStatus) {
      qb.andWhere('employee.onboardingStatus = :onboardingStatus', {
        onboardingStatus: query.onboardingStatus,
      });
    }
    if (query.withoutAccount) {
      // The picker behind "add user": people the company employs who cannot
      // sign in yet. NOT EXISTS rather than a join, so somebody is listed once
      // however their account history looks.
      qb.andWhere(
        `NOT EXISTS (SELECT 1 FROM admins a WHERE a.employee_id = employee.id)`,
      );
      // And who still work here. A deactivated record is somebody who has
      // left or never started; offering them a login is offering a way in to
      // an account nobody should be opening. They stay in the main list —
      // this filter narrows the candidates, not the register.
      qb.andWhere('employee.isActive = true');
    }

    const [items, total] = await qb
      .orderBy('employee.createdDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const decorated = await this.decorate(items);

    return {
      items: decorated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * The choke point — everything that reads one employee comes through here.
   *
   * An employee of another unit gives the same 404 as one that does not exist.
   * They are different facts, and separating them would turn this into a way
   * to confirm that a named colleague works for a brand you cannot see.
   */
  async findById(id: string, actorSite: number): Promise<Employee> {
    const employee = await this.employeeRepo.findOne({
      where: { id, isDeleted: false, employerSiteCode: actorSite },
      relations: { department: true, office: true, manager: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async view(id: string, actorSite: number): Promise<EmployeeRow> {
    const employee = await this.findById(id, actorSite);
    const [row] = await this.decorate([employee]);
    return row!;
  }

  async options(actorSite: number): Promise<EmployeeOptions> {
    const [departments, offices, managers] = await Promise.all([
      this.departmentRepo.find({
        where: { isActive: true, isDeleted: false },
        order: { displayOrder: 'ASC' },
      }),
      // Offices are filtered to the caller's dashboard — an IT admin should
      // not be offering somebody a desk in a Privacy office.
      this.officeRepo.find({
        where: { siteCode: actorSite, isActive: true, isDeleted: false },
        order: { displayOrder: 'ASC' },
      }),
      // Managers from the same unit only — a reporting line that crosses
      // brands would name somebody the reader cannot open.
      this.employeeRepo.find({
        where: { isActive: true, isDeleted: false, employerSiteCode: actorSite },
        select: { id: true, fullName: true, designation: true },
        order: { fullName: 'ASC' },
      }),
    ]);

    return {
      departments: departments.map((d) => ({
        code: d.departmentCode,
        name: d.departmentName,
      })),
      offices: offices.map((o) => ({
        code: o.officeCode,
        name: o.officeName,
        city: o.city,
        country: o.countryName,
      })),
      employmentTypes: [...EMPLOYMENT_TYPES],
      workModes: [...WORK_MODES],
      managers: managers.map((m) => ({
        id: m.id,
        name: m.fullName,
        designation: m.designation,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Writing
  // -------------------------------------------------------------------------

  /**
   * File somebody. Creates the person and their eight empty document slots.
   *
   * No account, deliberately: being employed and being able to sign in are
   * different decisions, usually taken by different people on different days.
   * A superadmin grants access afterwards, choosing from people already filed.
   */
  async create(dto: CreateEmployeeDto, actorSite: number): Promise<Employee> {
    await this.requireDepartmentExists(dto.departmentCode);
    await this.requireEmailFree(dto.workEmail);
    // Same unit, so a manager is somebody the filer can actually see.
    if (dto.reportingTo) await this.findById(dto.reportingTo, actorSite);

    const employee = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(Employee, {
          // Taken from the token, never from the body: you file people into
          // the unit you are signed in to, as every other module does.
          employerSiteCode: actorSite,
          employeeCode: await this.nextEmployeeCode(manager),
          fullName: dto.fullName,
          workEmail: dto.workEmail,
          personalEmail: dto.personalEmail ?? null,
          mobile: dto.mobile ?? null,
          designation: dto.designation,
          departmentCode: dto.departmentCode,
          employmentType: dto.employmentType,
          workMode: dto.workMode ?? 'ONSITE',
          officeCode: dto.officeCode ?? null,
          joiningDate: dto.joiningDate ?? null,
          reportingTo: dto.reportingTo ?? null,
          monthlyNetPay: dto.monthlyNetPay?.toFixed(2) ?? null,
        }),
      );

      // All eight slots up front, at MISSING. A checklist whose items only
      // appear once they are done cannot be read for what is outstanding,
      // which is the only question anyone asks of a personnel file.
      await manager.save(
        DOCUMENT_TYPES.map((docType) =>
          manager.create(EmployeeDocument, {
            employeeId: saved.id,
            docType,
            status: 'MISSING' as const,
          }),
        ),
      );

      return saved;
    });

    this.logger.log(
      `Employee filed: ${employee.employeeCode} ${employee.workEmail} on site ${actorSite}`,
    );
    return this.findById(employee.id, actorSite);
  }

  /**
   * Remove somebody from the register.
   *
   * A soft delete, and it has to be: `employee_documents` and
   * `employee_payslips` cascade on a real one, and a personnel file is not
   * something to destroy because a record was filed by mistake. The row leaves
   * every list — they all filter `isDeleted` — and everything hanging off it
   * stays where it is.
   *
   * Refused while they can still sign in. The account points at this row
   * through `admins.employee_id`, which the schema declares ON DELETE
   * RESTRICT: the database already believes a login must not outlive the
   * person it belongs to. Deleting here would leave an account whose holder
   * has no record, which is exactly the state the whole employee-versus-account
   * split exists to prevent.
   *
   * Deactivating is the other door, and usually the right one — somebody who
   * has left is still somebody the company employed.
   */
  async remove(id: string, actorSite: number): Promise<{ message: string }> {
    const employee = await this.findById(id, actorSite);

    const account = await this.adminRepo.findOne({
      where: { employeeId: id },
      select: ['id', 'email'],
    });
    if (account) {
      throw new ConflictException(
        `${employee.fullName} can still sign in as ${account.email}. ` +
          'Remove their access under Team & roles first, or deactivate the ' +
          'record instead of deleting it.',
      );
    }

    await this.employeeRepo.update(
      { id },
      { isDeleted: true, deletedAt: new Date(), isActive: false },
    );

    return { message: `${employee.fullName} removed from the register` };
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    actorSite: number,
  ): Promise<Employee> {
    const employee = await this.findById(id, actorSite);

    if (dto.departmentCode !== undefined) {
      await this.requireDepartmentExists(dto.departmentCode);
    }
    if (dto.workEmail && dto.workEmail !== employee.workEmail) {
      await this.requireEmailFree(dto.workEmail);
    }
    if (dto.reportingTo) {
      if (dto.reportingTo === id) {
        throw new BadRequestException('Somebody cannot report to themselves');
      }
      await this.findById(dto.reportingTo, actorSite);
    }

    const patch: Partial<Employee> = {};
    if (dto.fullName !== undefined) patch.fullName = dto.fullName;
    if (dto.workEmail !== undefined) patch.workEmail = dto.workEmail;
    if (dto.personalEmail !== undefined) patch.personalEmail = dto.personalEmail;
    if (dto.mobile !== undefined) patch.mobile = dto.mobile;
    if (dto.designation !== undefined) patch.designation = dto.designation;
    if (dto.departmentCode !== undefined) patch.departmentCode = dto.departmentCode;
    if (dto.employmentType !== undefined) patch.employmentType = dto.employmentType;
    if (dto.workMode !== undefined) patch.workMode = dto.workMode;
    if (dto.officeCode !== undefined) patch.officeCode = dto.officeCode;
    if (dto.joiningDate !== undefined) patch.joiningDate = dto.joiningDate;
    if (dto.reportingTo !== undefined) patch.reportingTo = dto.reportingTo;
    if (dto.monthlyNetPay !== undefined) {
      patch.monthlyNetPay = dto.monthlyNetPay.toFixed(2);
    }
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    /*
     * Set here and nowhere else. Nothing in this service derives it, and the
     * document routes deliberately leave it alone — verifying the last file
     * does not mark somebody onboarded, because deciding that is the point of
     * the field.
     */
    if (dto.onboardingStatus !== undefined) {
      patch.onboardingStatus = dto.onboardingStatus;
    }

    if (Object.keys(patch).length) {
      await this.employeeRepo.update({ id }, patch);
    }

    /*
     * The work email is the authoritative one, so an account created from it
     * follows the change. Letting the two drift would leave somebody signing
     * in with an address their own record says is wrong.
     */
    if (dto.workEmail && dto.workEmail !== employee.workEmail) {
      await this.adminRepo.update({ employeeId: id }, { email: dto.workEmail });
    }
    if (dto.fullName) {
      await this.adminRepo.update({ employeeId: id }, { fullName: dto.fullName });
    }

    return this.findById(id, actorSite);
  }

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  async documents(
    employeeId: string,
    actorSite: number,
  ): Promise<EmployeeDocument[]> {
    await this.findById(employeeId, actorSite);
    const rows = await this.documentRepo.find({
      where: { employeeId },
      relations: { file: true },
    });

    // Returned in the order the file is read, not the order rows were written.
    const order = new Map(DOCUMENT_TYPES.map((t, i) => [t, i]));
    return rows.sort(
      (a, b) => (order.get(a.docType) ?? 99) - (order.get(b.docType) ?? 99),
    );
  }

  /**
   * Attach a file to one slot, or move its status.
   *
   * Attaching always lands at PENDING, and a call that tries to do both is
   * refused rather than quietly downgraded. An uploaded document is not a
   * checked one; letting one request attach and verify would make the middle
   * state optional, and a checklist that can tick itself is not a check.
   *
   * Verifying is therefore a second, deliberate call, and it is stamped with
   * the name of whoever made it.
   */
  async upsertDocument(
    employeeId: string,
    docType: DocumentType,
    dto: UpsertDocumentDto,
    actorEmail: string,
    actorSite: number,
  ): Promise<EmployeeDocument> {
    await this.findById(employeeId, actorSite);
    const row = await this.documentRepo.findOne({ where: { employeeId, docType } });
    if (!row) throw new NotFoundException(`No ${docType} slot on this file`);

    const attaching = dto.fileId !== undefined && dto.fileId !== row.fileId;

    if (attaching && dto.status === 'VERIFIED') {
      throw new BadRequestException(
        'A document cannot be uploaded and verified in one step. ' +
          'Attach it first, then verify it once somebody has read it.',
      );
    }

    if (dto.fileId !== undefined) row.fileId = dto.fileId;

    const status = attaching ? 'PENDING' : (dto.status ?? row.status);
    row.status = status;

    if (status === 'VERIFIED') {
      if (!row.fileId) {
        throw new BadRequestException(
          'There is nothing attached to verify. Upload the document first.',
        );
      }
      row.verifiedAt = new Date();
      row.verifiedBy = actorEmail;
    } else {
      // Moving off VERIFIED clears the sign-off — it referred to a file that
      // may no longer be the one attached.
      row.verifiedAt = null;
      row.verifiedBy = null;
    }

    await this.documentRepo.save(row);
    return (await this.documentRepo.findOne({
      where: { id: row.id },
      relations: { file: true },
    }))!;
  }

  /** Detach without deleting the file, and return the slot to MISSING. */
  async detachDocument(
    employeeId: string,
    docType: DocumentType,
    actorSite: number,
  ): Promise<EmployeeDocument> {
    return this.upsertDocument(
      employeeId,
      docType,
      { status: 'MISSING' },
      '',
      actorSite,
    ).then(async () => {
      await this.documentRepo.update({ employeeId, docType }, { fileId: null });
      return (await this.documentRepo.findOne({ where: { employeeId, docType } }))!;
    });
  }

  // -------------------------------------------------------------------------
  // Payslips
  // -------------------------------------------------------------------------

  async payslips(
    employeeId: string,
    actorSite: number,
  ): Promise<EmployeePayslip[]> {
    await this.findById(employeeId, actorSite);
    return this.payslipRepo.find({
      where: { employeeId },
      relations: { file: true },
      order: { periodMonth: 'DESC' },
    });
  }

  async addPayslip(
    employeeId: string,
    dto: CreatePayslipDto,
    actorSite: number,
  ): Promise<EmployeePayslip> {
    await this.findById(employeeId, actorSite);

    // Normalised to the first of the month, so March is one row whichever day
    // of March the caller happened to send.
    const period = new Date(dto.periodMonth);
    if (Number.isNaN(period.getTime())) {
      throw new BadRequestException('periodMonth is not a date');
    }
    const periodMonth = `${period.getUTCFullYear()}-${String(
      period.getUTCMonth() + 1,
    ).padStart(2, '0')}-01`;

    const existing = await this.payslipRepo.findOne({
      where: { employeeId, periodMonth },
    });
    if (existing) {
      throw new ConflictException(
        `A payslip for ${periodMonth.slice(0, 7)} already exists`,
      );
    }

    const saved = await this.payslipRepo.save(
      this.payslipRepo.create({
        employeeId,
        periodMonth,
        fileId: dto.fileId ?? null,
        netPay: dto.netPay?.toFixed(2) ?? null,
        issuedAt: new Date(),
      }),
    );

    return (await this.payslipRepo.findOne({
      where: { id: saved.id },
      relations: { file: true },
    }))!;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Counts for a page, in two queries rather than two per row.
   *
   * The list shows document progress and payslip totals for everyone at once;
   * asking per employee would be a query per row on every page load.
   */
  private async decorate(employees: Employee[]): Promise<EmployeeRow[]> {
    if (!employees.length) return [];
    const ids = employees.map((e) => e.id);

    const [docs, slips, accounts] = await Promise.all([
      this.documentRepo.find({
        where: { employeeId: In(ids) },
        select: { employeeId: true, status: true, id: true },
      }),
      this.payslipRepo.find({
        where: { employeeId: In(ids) },
        select: { employeeId: true, id: true },
      }),
      this.adminRepo.find({
        where: { employeeId: In(ids) },
        select: { id: true, employeeId: true },
      }),
    ]);

    const verified = new Map<string, number>();
    const total = new Map<string, number>();
    for (const d of docs) {
      total.set(d.employeeId, (total.get(d.employeeId) ?? 0) + 1);
      if (d.status === 'VERIFIED') {
        verified.set(d.employeeId, (verified.get(d.employeeId) ?? 0) + 1);
      }
    }
    const slipCount = new Map<string, number>();
    for (const s of slips) {
      slipCount.set(s.employeeId, (slipCount.get(s.employeeId) ?? 0) + 1);
    }
    const withAccount = new Set(accounts.map((a) => a.employeeId!));

    return employees.map((e) => ({
      ...e,
      documentsVerified: verified.get(e.id) ?? 0,
      documentsTotal: total.get(e.id) ?? DOCUMENT_TYPES.length,
      payslipCount: slipCount.get(e.id) ?? 0,
      hasAccount: withAccount.has(e.id),
    }));
  }

  /** VTX-EMP-0001. The sequence is shared with the codes already issued. */
  private async nextEmployeeCode(manager: EntityManager): Promise<string> {
    const [{ nextval }] = await manager.query<{ nextval: string }[]>(
      `SELECT nextval('admin_employee_code_seq') AS nextval`,
    );
    return `VTX-EMP-${String(Number(nextval)).padStart(4, '0')}`;
  }

  private async requireDepartmentExists(code: number): Promise<void> {
    const found = await this.departmentRepo.findOne({
      where: { departmentCode: code, isActive: true, isDeleted: false },
    });
    if (!found) {
      throw new BadRequestException(`Unknown department code: ${code}`);
    }
  }

  private async requireEmailFree(workEmail: string): Promise<void> {
    const clash = await this.employeeRepo.findOne({ where: { workEmail } });
    if (clash) {
      throw new ConflictException(`${workEmail} is already on someone's record`);
    }
  }
}
