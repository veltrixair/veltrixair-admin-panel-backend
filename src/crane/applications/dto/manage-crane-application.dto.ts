import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ToBoolean } from '../../../common/transformers/to-boolean.transformer';
import { CRANE_APPLICATION_STATUSES } from '../entities/crane-application.entity';
import type { CraneApplicationStatus } from '../entities/crane-application.entity';

export class ListCraneApplicationsDto extends PaginationQueryDto {
  /** Matches name, email or reference number. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(CRANE_APPLICATION_STATUSES, {
    message: `status must be one of: ${CRANE_APPLICATION_STATUSES.join(', ')}`,
  })
  status?: CraneApplicationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  trackCode?: number;

  @IsOptional()
  @IsUUID('4')
  jobId?: string;

  /**
   * Candidates who attached no certificates.
   *
   * Replaces an `awaitingCv` filter that stopped meaning anything once the CV
   * became part of the form. This is the queue that matters now: a role calling
   * for ISO 9927 or an NDT card, and an applicant who sent neither.
   */
  @IsOptional()
  @ToBoolean()
  withoutCertificates?: boolean;

  /** Past the deadline the careers page published for their current stage. */
  @IsOptional()
  @ToBoolean()
  overdue?: boolean;
}

export class UpdateCraneApplicationStatusDto {
  @IsIn(CRANE_APPLICATION_STATUSES, {
    message: `status must be one of: ${CRANE_APPLICATION_STATUSES.join(', ')}`,
  })
  status: CraneApplicationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** Send `assignedTo: null` to return it to the unassigned queue. */
export class AssignCraneApplicationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Provide a recruiter, or null to unassign.' })
  @MaxLength(150)
  assignedTo?: string | null;
}

export class AddCraneApplicationNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'A note cannot be empty.' })
  @MaxLength(2000)
  note: string;
}
