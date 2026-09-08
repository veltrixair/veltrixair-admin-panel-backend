import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  EMPLOYMENT_TYPES,
  WORK_MODES,
} from '../entities/employee.entity';
import type { EmploymentType, WorkMode } from '../entities/employee.entity';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
} from '../entities/employee-document.entity';
import type {
  DocumentStatus,
  DocumentType,
} from '../entities/employee-document.entity';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * File somebody as an employee.
 *
 * No `employeeCode`: it is issued server-side in the house format, and letting
 * a form supply one would let two people be filed under the same number.
 */
export class CreateEmployeeDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'A valid work email is required' })
  @MaxLength(255)
  workEmail: string;

  /** Where anything reaches them once they have left and lost the work one. */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Personal email must be a valid address' })
  @MaxLength(255)
  personalEmail?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(32)
  mobile?: string;

  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  designation: string;

  @Type(() => Number)
  @IsInt()
  departmentCode: number;

  @IsIn(EMPLOYMENT_TYPES, {
    message: `employmentType must be one of: ${EMPLOYMENT_TYPES.join(', ')}`,
  })
  employmentType: EmploymentType;

  @IsOptional()
  @IsIn(WORK_MODES, {
    message: `workMode must be one of: ${WORK_MODES.join(', ')}`,
  })
  workMode?: WorkMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  officeCode?: number;

  @IsOptional()
  @IsISO8601({ strict: false })
  joiningDate?: string;

  @IsOptional()
  @IsUUID()
  reportingTo?: string;

  /**
   * Read only under FEATURE.HR. Kept on the person rather than derived from
   * the latest payslip, because it is what was agreed — a month with a bonus
   * or unpaid leave in it is not the salary.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyNetPay?: number;
}

/** Every field optional — PATCH semantics. `employeeCode` is never settable. */
export class UpdateEmployeeDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  workEmail?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  personalEmail?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(32)
  mobile?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  designation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentCode?: number;

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsIn(WORK_MODES)
  workMode?: WorkMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  officeCode?: number;

  @IsOptional()
  @IsISO8601({ strict: false })
  joiningDate?: string;

  @IsOptional()
  @IsUUID()
  reportingTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyNetPay?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListEmployeesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentCode?: number;

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsIn(WORK_MODES)
  workMode?: WorkMode;

  /**
   * Only people who cannot sign in yet — what the "add user" picker asks for,
   * so it never offers somebody who already has an account.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  withoutAccount?: boolean;
}

/** Attach an uploaded file to one slot, or move that slot's status. */
export class UpsertDocumentDto {
  @IsOptional()
  @IsUUID()
  fileId?: string;

  @IsOptional()
  @IsIn(DOCUMENT_STATUSES, {
    message: `status must be one of: ${DOCUMENT_STATUSES.join(', ')}`,
  })
  status?: DocumentStatus;
}

export class DocumentTypeParam {
  @IsIn(DOCUMENT_TYPES)
  docType: DocumentType;
}

export class CreatePayslipDto {
  /**
   * Any date inside the month it covers; the service normalises to the first.
   * A slip for March raised in April is a March slip.
   */
  @IsISO8601({ strict: false })
  periodMonth: string;

  @IsOptional()
  @IsUUID()
  fileId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  netPay?: number;
}
