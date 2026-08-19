import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JOB_STATUSES, WORK_MODES } from '../entities/job-posting.entity';
import type { JobStatus, WorkMode } from '../entities/job-posting.entity';

export const JOB_SORTS = ['newest', 'oldest', 'title'] as const;
export type JobSort = (typeof JOB_SORTS)[number];

/** Mirrors the filter controls on /careers/. */
export class ListJobsDto extends PaginationQueryDto {
  /** Practice chip — slug form, e.g. "cyber", "business-apps". Omit for "All". */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  practice?: string;

  /** Location chip — city slug, e.g. "riyadh". Omit for "All". */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  /** Work-mode chip — ONSITE | HYBRID | REMOTE. Omit for "All". */
  @IsOptional()
  @IsIn(WORK_MODES)
  workMode?: WorkMode;

  /** Keyword search across ref code, title and summary. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  hotOnly?: string;

  @IsOptional()
  @IsIn(JOB_SORTS)
  sort?: JobSort;
}

/** Admin-only: lets staff see drafts and closed roles too. */
export class ListJobsAdminDto extends ListJobsDto {
  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: JobStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  practiceCode?: number;
}
