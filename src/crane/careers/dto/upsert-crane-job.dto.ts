import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CRANE_JOB_STATUSES } from '../entities/crane-job-posting.entity';
import type { CraneJobStatus } from '../entities/crane-job-posting.entity';

export class ListCraneJobsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(CRANE_JOB_STATUSES, {
    message: `status must be one of: ${CRANE_JOB_STATUSES.join(', ')}`,
  })
  status?: CraneJobStatus;

  /** The career-track filter the page shows above the listing. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  trackCode?: number;

  /** Narrow the list to one department. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  locationCode?: number;

  /**
   * A string, not a boolean, because it arrives in the query string — the
   * same shape the IT board takes, so the two filters behave alike.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  hotOnly?: string;
}

/**
 * One shape for create and update.
 *
 * Everything is optional so a PATCH can send a single field; `create` still
 * requires the essentials, checked in the service where the difference between
 * "creating" and "editing" is actually known.
 */
export class UpsertCraneJobDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  refCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  slug?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Choose a career track for this role.' })
  trackCode?: number;

  /**
   * The part of the business that owns the headcount.
   *
   * Separate from the track, which is the route a candidate applies through —
   * a graduate intake is a track and belongs to no one department, so this
   * stays optional.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Choose a department for this role.' })
  departmentCode?: number;

  /**
   * The VTX-CRN-xx discipline. Send null for the roles outside the service
   * catalogue — sales, HSE, the graduate programme.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceLineCode?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Choose where this role is based.' })
  locationCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employmentTypeCode?: number;

  /** Null where the advert states no minimum. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  experienceBandCode?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  descriptionMdx?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  responsibilities?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  requirements?: string[];

  /** "ISO 9927", "NDT Level II" — whatever the awarding body calls it. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  certifications?: string[];

  /**
   * Printed on the advert, never enforced at submit — refusing an applicant on
   * nationality is a decision for a person, not a validator.
   */
  @IsOptional()
  @IsBoolean()
  saudiNationalsOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  openings?: number;

  /** Pins the advert to the top of the board and prints the "Hot" badge. */
  @IsOptional()
  @IsBoolean()
  hotRole?: boolean;

  @IsOptional()
  @IsIn(CRANE_JOB_STATUSES)
  status?: CraneJobStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  seoDescription?: string;

  @IsOptional()
  @IsISO8601()
  closesAt?: string;
}

export class UpdateCraneJobStatusDto {
  @IsIn(CRANE_JOB_STATUSES, {
    message: `status must be one of: ${CRANE_JOB_STATUSES.join(', ')}`,
  })
  status: CraneJobStatus;
}
