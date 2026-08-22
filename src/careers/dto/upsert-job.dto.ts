import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
} from 'class-validator';
import { JOB_STATUSES, WORK_MODES } from '../entities/job-posting.entity';
import type { JobStatus, WorkMode } from '../entities/job-posting.entity';
import { IsApplicationFieldConfig } from '../../applications/dto/application-field-config.validator';
import type { ApplicationFieldConfig } from '../../applications/application-fields.constants';

export class CreateJobDto {
  @IsString()
  @MaxLength(20)
  refCode: string;

  @IsString()
  @MaxLength(200)
  slug: string;

  @IsString()
  @MaxLength(200)
  title: string;

  /**
   * The whole advert. Required since the summary, responsibilities and
   * requirements columns were folded into it — with those gone this is the
   * only place the role is described at all, and a posting without one is a
   * title on a careers page and nothing else.
   */
  @IsString()
  @IsNotEmpty({ message: 'Please write the job description.' })
  descriptionMdx: string;

  @Type(() => Number)
  @IsInt()
  practiceCode: number;

  /** One or more location codes; a role may span several. */
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  locationCodes: number[];

  @IsString()
  @MaxLength(150)
  locationLabel: string;

  @IsIn(WORK_MODES)
  workMode: WorkMode;

  @Type(() => Number)
  @IsInt()
  officeCode: number;

  @IsString()
  @MaxLength(100)
  employmentType: string;

  @IsString()
  @MaxLength(50)
  experienceLabel: string;

  @IsOptional()
  @IsBoolean()
  visaSponsorship?: boolean;

  @IsOptional()
  @IsBoolean()
  hotRole?: boolean;

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
  @MaxLength(500)
  seoDescription?: string;

  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: JobStatus;

  @IsOptional()
  @IsISO8601()
  postedAt?: string;

  @IsOptional()
  @IsISO8601()
  closesAt?: string;

  /**
   * Which questions the apply form asks for this role, and which of them
   * are required. Omit it to keep the defaults.
   *
   * Validated key by key against the catalogue rather than accepted as free
   * JSON — see IsApplicationFieldConfig for why a typo would otherwise be
   * stored happily and never take effect.
   */
  @IsOptional()
  @IsObject()
  @Validate(IsApplicationFieldConfig)
  applicationFields?: ApplicationFieldConfig;
}

/** Every field optional — PATCH semantics. */
export class UpdateJobDto extends CreateJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  declare refCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  declare slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  declare title: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  declare practiceCode: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  declare locationCodes: number[];

  @IsOptional()
  @IsString()
  @MaxLength(150)
  declare locationLabel: string;

  @IsOptional()
  @IsIn(WORK_MODES)
  declare workMode: WorkMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  declare officeCode: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  declare employmentType: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  declare experienceLabel: string;

  /**
   * Optional on update, required on create.
   *
   * A PATCH that only closes a role must not have to resend the whole advert —
   * but when it IS sent it still cannot be blanked, so the not-empty rule
   * stays.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'The job description cannot be emptied.' })
  declare descriptionMdx: string;
}

export class UpdateJobStatusDto {
  @IsIn(JOB_STATUSES)
  status: JobStatus;
}
