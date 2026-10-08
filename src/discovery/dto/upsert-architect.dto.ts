import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BLACKOUT_REASONS } from '../entities/architect-blackout.entity';
import type { BlackoutReason } from '../entities/architect-blackout.entity';

/**
 * A new architect.
 *
 * Everything here is required except the active flag. The columns behind
 * email, phone, experience and industries are nullable only because nine
 * architects predate them — see the entity. Nothing created through this DTO
 * is allowed to be half a record.
 */
export class CreateArchitectDto {
  @IsString()
  @IsNotEmpty({ message: 'Enter the architect’s full name.' })
  @MaxLength(150)
  fullName: string;

  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(190)
  email: string;

  /*
   * Deliberately loose. These are colleagues in several countries, written
   * down however their own office writes them — "+966 55 123 4567" and
   * "09800327990" are both somebody's real number, and a pattern strict
   * enough to be worth having would reject one of them.
   */
  @IsString()
  @IsNotEmpty({ message: 'Enter a contact number.' })
  @MaxLength(30)
  phone: string;

  /** e.g. "Senior Architect — Data Privacy". */
  @IsString()
  @IsNotEmpty({ message: 'Enter a designation.' })
  @MaxLength(150)
  designation: string;

  /**
   * The industries this architect knows — one or more, from the industry
   * master the contact form already uses.
   */
  @IsArray()
  @ArrayNotEmpty({ message: 'Choose at least one industry.' })
  @Type(() => Number)
  @IsInt({ each: true })
  industryCodes: number[];

  /**
   * Years in the profession.
   *
   * Capped at 60 rather than left open: the pair of digits that gets typed by
   * accident is the one worth catching, and nobody has a sixty-first year of
   * practice to record.
   */
  @Type(() => Number)
  @IsInt({ message: 'Experience must be a whole number of years.' })
  @Min(0)
  @Max(60)
  experienceYears: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** The same record, every field optional — send only what changed. */
export class UpdateArchitectDto extends CreateArchitectDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Enter the architect’s full name.' })
  @MaxLength(150)
  declare fullName: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(190)
  declare email: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Enter a contact number.' })
  @MaxLength(30)
  declare phone: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Enter a designation.' })
  @MaxLength(150)
  declare designation: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'Choose at least one industry.' })
  @Type(() => Number)
  @IsInt({ each: true })
  declare industryCodes: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Experience must be a whole number of years.' })
  @Min(0)
  @Max(60)
  declare experienceYears: number;
}

/**
 * Replaces the whole set of industries an architect covers.
 *
 * A replace rather than add/remove: the caller states the intended end state,
 * so there is no ordering hazard when two edits land close together.
 */
export class AssignIndustriesDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Choose at least one industry.' })
  @Type(() => Number)
  @IsInt({ each: true })
  industryCodes: number[];
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
