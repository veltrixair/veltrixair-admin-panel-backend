import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FEATURE, PERMISSION } from '../auth/permissions.constants';
import type { AuthenticatedAdmin } from '../auth/permissions.constants';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import {
  CreateEmployeeDto,
  CreatePayslipDto,
  ListEmployeesDto,
  UpdateEmployeeDto,
  UpsertDocumentDto,
} from './dto/employee.dto';
import { EmployeeService } from './employee.service';
import type { EmployeeOptions, EmployeeRow } from './employee.service';
import { Employee } from './entities/employee.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import type { DocumentType } from './entities/employee-document.entity';
import { EmployeePayslip } from './entities/employee-payslip.entity';

/**
 * Employee onboarding — the personnel file, and who may read it.
 *
 * Gated by `FEATURE.HR`, which is deliberately not `FEATURE.ADMINS`. Managing
 * accounts and reading somebody's salary are different powers: an IT admin who
 * can create logins has no business in a colleague's payslips, and HR needs the
 * file without administering anything. The migration grants this feature to
 * Super Admin and HR Manager, and to nobody else.
 */
@ApiTags('Employee onboarding (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard)
@Controller('admin/employees')
export class AdminEmployeeController {
  constructor(private readonly employees: EmployeeService) {}

  /**
   * Above `:id`, or the router reads "options" as an employee id and answers
   * 400 for a word that is not a uuid.
   */
  @Get('options')
  @Permissions(FEATURE.HR, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Departments, offices, types, work modes, managers' })
  @ResponseMessage('Options retrieved')
  options(@CurrentUser() admin: AuthenticatedAdmin): Promise<EmployeeOptions> {
    return this.employees.options(admin.siteCode);
  }

  @Get()
  @Permissions(FEATURE.HR, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'List employees — `withoutAccount=true` for the add-user picker',
  })
  @ResponseMessage('Employees retrieved')
  list(
    @Query() query: ListEmployeesDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PaginatedResult<EmployeeRow>> {
    return this.employees.list(query, admin.siteCode);
  }

  @Get(':id')
  @Permissions(FEATURE.HR, PERMISSION.VIEW)
  @ApiOperation({ summary: 'One employee, with document and payslip counts' })
  @ResponseMessage('Employee retrieved')
  view(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<EmployeeRow> {
    return this.employees.view(id, admin.siteCode);
  }

  /**
   * File somebody. Creates the person and their eight empty document slots,
   * and deliberately no login — a superadmin grants that separately, choosing
   * from people already on record.
   */
  @Post()
  @Permissions(FEATURE.HR, PERMISSION.CREATE)
  @ApiOperation({ summary: 'Start onboarding — files a person, no account' })
  @ResponseMessage('Employee added')
  create(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<Employee> {
    return this.employees.create(dto, admin.siteCode);
  }

  @Patch(':id')
  @Permissions(FEATURE.HR, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Update an employee record' })
  @ResponseMessage('Employee updated')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<Employee> {
    return this.employees.update(id, dto, admin.siteCode);
  }

  /**
   * Remove somebody from the register — a soft delete.
   *
   * DELETE rather than a flag on the update, because it is a different act:
   * correcting a record and withdrawing it are not the same decision, and only
   * one of them takes the row out of every list.
   */
  @Delete(':id')
  @Permissions(FEATURE.HR, PERMISSION.DELETE)
  @ApiOperation({
    summary: 'Remove an employee — refused while they still have a login',
  })
  @ResponseMessage('Employee removed')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ message: string }> {
    return this.employees.remove(id, admin.siteCode);
  }

  // --- documents ----------------------------------------------------------

  @Get(':id/documents')
  @Permissions(FEATURE.HR, PERMISSION.VIEW)
  @ApiOperation({ summary: 'All eight slots, in file order' })
  @ResponseMessage('Documents retrieved')
  documents(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<EmployeeDocument[]> {
    return this.employees.documents(id, admin.siteCode);
  }

  /**
   * Attach a file to one slot, or move its status.
   *
   * Upload through `POST /admin/files/upload` first with purpose
   * `EMPLOYEE_DOCUMENT`, then send the id here — the same two steps every
   * other attachment uses, so a failed attach never leaves a half-filed
   * document.
   */
  @Patch(':id/documents/:docType')
  @Permissions(FEATURE.HR, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Attach a document, or mark it pending/verified' })
  @ResponseMessage('Document updated')
  upsertDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docType') docType: DocumentType,
    @Body() dto: UpsertDocumentDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<EmployeeDocument> {
    return this.employees.upsertDocument(
      id,
      docType,
      dto,
      admin.email,
      admin.siteCode,
    );
  }

  /** Detaches without deleting the file, returning the slot to MISSING. */
  @Delete(':id/documents/:docType')
  @Permissions(FEATURE.HR, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Detach a document' })
  @ResponseMessage('Document detached')
  detachDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docType') docType: DocumentType,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<EmployeeDocument> {
    return this.employees.detachDocument(id, docType, admin.siteCode);
  }

  // --- payslips -----------------------------------------------------------

  @Get(':id/payslips')
  @Permissions(FEATURE.HR, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Payslips, newest month first' })
  @ResponseMessage('Payslips retrieved')
  payslips(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<EmployeePayslip[]> {
    return this.employees.payslips(id, admin.siteCode);
  }

  @Post(':id/payslips')
  @Permissions(FEATURE.HR, PERMISSION.CREATE)
  @ApiOperation({ summary: 'Issue a payslip for one month' })
  @ResponseMessage('Payslip added')
  addPayslip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePayslipDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<EmployeePayslip> {
    return this.employees.addPayslip(id, dto, admin.siteCode);
  }
}
