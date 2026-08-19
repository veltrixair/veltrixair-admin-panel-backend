import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BLACKOUT_REASONS } from '../entities/architect-blackout.entity';
import type { BlackoutReason } from '../entities/architect-blackout.entity';

export class CreateArchitectDto {
  @IsString()
  @MaxLength(120)
  slug: string;

  /** Optional — a practitioner can be recorded before their name is published. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  /** Shown while `fullName` is unset, e.g. "Senior Architect — Data Privacy". */
  @IsString()
  @MaxLength(150)
  displayTitle: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  credentials?: string;

  /**
   * The practices this architect covers. One or more — the disciplines
   * overlap, so a practitioner may serve Cybersecurity & SOC and Data Privacy.
   */
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  practiceCodes: number[];

  /** Drives the deliverables SLA — each office has its own working week. */
  @Type(() => Number)
  @IsInt()
  officeCode: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateArchitectDto extends CreateArchitectDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  declare slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  declare displayTitle: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  declare practiceCodes: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  declare officeCode: number;
}

/**
 * Replaces the whole set of practices an architect covers.
 *
 * A replace rather than add/remove: the caller states the intended end state,
 * so there is no ordering hazard when two edits land close together.
 */
export class AssignPracticesDto {
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  practiceCodes: number[];
}

export class AvailabilityRuleDto {
  /** JS day number — 0 Sunday … 6 Saturday. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  startHour: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  endHour: number;

  /** Timezone the hours are expressed in, e.g. "Asia/Riyadh". */
  @IsString()
  @MaxLength(64)
  timezone: string;

  @IsISO8601({ strict: false })
  effectiveFrom: string;

  @IsOptional()
  @IsISO8601({ strict: false })
  effectiveTo?: string;
}

/**
 * Replaces an architect's whole weekly pattern.
 *
 * A weekly off day is simply an absent weekday — there is no "closed" row.
 */
export class ReplaceAvailabilityDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleDto)
  rules: AvailabilityRuleDto[];
}

export class CreateBlackoutDto {
  /** Omit to close the period for every architect — a firm-wide holiday. */
  @IsOptional()
  @IsString()
  architectId?: string;

  @IsISO8601()
  startsAt: string;

  @IsISO8601()
  endsAt: string;

  @IsIn(BLACKOUT_REASONS)
  reason: BlackoutReason;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
