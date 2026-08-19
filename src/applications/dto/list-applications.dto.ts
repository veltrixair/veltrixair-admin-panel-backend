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
