import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { APPLICATION_STATUSES } from '../entities/job-application.entity';
import type { ApplicationStatus } from '../entities/job-application.entity';

export class ListApplicationsDto extends PaginationQueryDto {
  /** Matches on name, email or reference number. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @IsOptional()
  @IsUUID('4', { message: 'jobId must be a valid job id' })
  jobId?: string;

  /**
   * Which kind of application, where `jobId` names a specific one.
   *
   * A GENERAL application is somebody answering "Be A Part Of Our Journey"
   * rather than a vacancy, and it carries no `job_id` at all. That makes it
   * unreachable through every role-shaped view in the panel — it belongs to
   * no posting, so no posting can list it — which is how eight of them sat
   * unread behind a dashboard that could not count them either.
   */
  @IsOptional()
  @IsIn(['ROLE', 'GENERAL'], {
    message: 'kind must be either ROLE or GENERAL',
  })
  kind?: 'ROLE' | 'GENERAL';

  @IsOptional()
  @IsIn(APPLICATION_STATUSES, {
    message: `status must be one of: ${APPLICATION_STATUSES.join(', ')}`,
  })
  status?: ApplicationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  noticePeriodCode?: number;

  /** "Show me candidates who don't need sponsorship." */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  workAuthorisationCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minExperienceYears?: number;
}
