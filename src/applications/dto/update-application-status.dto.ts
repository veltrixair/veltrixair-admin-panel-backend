import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { APPLICATION_STATUSES } from '../entities/job-application.entity';
import type { ApplicationStatus } from '../entities/job-application.entity';

/** WITHDRAWN is absent on purpose — only the candidate can withdraw. */
const ADMIN_SETTABLE = APPLICATION_STATUSES.filter((s) => s !== 'WITHDRAWN');

export class UpdateApplicationStatusDto {
  @IsIn(ADMIN_SETTABLE, {
    message: `status must be one of: ${ADMIN_SETTABLE.join(', ')}`,
  })
  status: Exclude<ApplicationStatus, 'WITHDRAWN'>;

  /** Recorded on the timeline. Worth insisting on for a rejection. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AssignApplicationDto {
  @IsString()
  @IsNotEmpty({ message: 'Provide the recruiter to assign this to.' })
  @MaxLength(150)
  assignedTo: string;
}

export class AddApplicationNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'A note cannot be empty.' })
  @MaxLength(2000)
  note: string;
}
