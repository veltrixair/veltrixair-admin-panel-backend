import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * A new engineer on the crane roster.
 *
 * Everything is required except the active flag. Unlike the architect roster,
 * no column here is nullable: this table starts empty, so there are no older
 * rows to accommodate and no reason to let a half-finished record in.
 */
export class CreateCraneEngineerDto {
  @IsString()
  @IsNotEmpty({ message: 'Enter the engineer’s full name.' })
  @MaxLength(150)
  fullName: string;

  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(190)
  email: string;

  /*
   * Deliberately loose. KSA mobiles, landlines and numbers written with or
   * without the country code are all somebody's real number, and a pattern
   * strict enough to be worth having would reject one of them.
   */
  @IsString()
  @IsNotEmpty({ message: 'Enter a contact number.' })
  @MaxLength(30)
  phone: string;

  /** e.g. "Senior Lifting Engineer". */
  @IsString()
  @IsNotEmpty({ message: 'Enter a designation.' })
  @MaxLength(150)
  designation: string;

  /** The services this engineer covers — one or more. */
  @IsArray()
  @ArrayNotEmpty({ message: 'Choose at least one service line.' })
  @Type(() => Number)
  @IsInt({ each: true })
  serviceLineCodes: number[];

  /**
   * Years in the profession.
   *
   * Capped at 60 rather than left open: the pair of digits typed by accident
   * is the one worth catching.
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
export class UpdateCraneEngineerDto extends CreateCraneEngineerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Enter the engineer’s full name.' })
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
  @ArrayNotEmpty({ message: 'Choose at least one service line.' })
  @Type(() => Number)
  @IsInt({ each: true })
  declare serviceLineCodes: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Experience must be a whole number of years.' })
  @Min(0)
  @Max(60)
  declare experienceYears: number;
}

/**
 * Replaces the whole set of service lines an engineer covers.
 *
 * A replace rather than add/remove: the caller states the intended end state,
 * so there is no ordering hazard when two edits land close together.
 */
export class AssignServiceLinesDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Choose at least one service line.' })
  @Type(() => Number)
  @IsInt({ each: true })
  serviceLineCodes: number[];
}
