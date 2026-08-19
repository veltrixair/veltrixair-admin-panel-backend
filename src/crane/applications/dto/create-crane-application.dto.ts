import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * The three-section form on veltrixairindustries.com/careers/.
 *
 * No CV field: the page asks candidates to reply to the acknowledgement with it
 * attached, so the file arrives later and is put on the record by an admin.
 */
export class CreateCraneApplicationDto {
  // --- Section 01: position of interest -----------------------------------

  @Type(() => Number)
  @IsInt({ message: 'Please choose a career track.' })
  trackCode: number;

  /** Optional — "General application" is one of the tracks. */
  @IsOptional()
  @IsUUID('4', { message: 'That role reference is not valid.' })
  jobId?: string;

  @Type(() => Number)
  @IsInt({ message: 'Please select your years of relevant experience.' })
  experienceBandCode: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  availabilityCode?: number;

  // --- Section 02: personal and contact -----------------------------------

  @IsString()
  @IsNotEmpty({ message: 'Please enter your full name.' })
  @MaxLength(150)
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Please enter your nationality.' })
  @MaxLength(100)
  nationality: string;

  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MaxLength(255)
  email: string;

  /**
   * Doubles as WhatsApp. Deliberately permissive — candidates write numbers a
   * dozen ways across four countries, and losing a real applicant to a bracket
   * is worse than storing an odd string.
   */
  @IsString()
  @Matches(/^[\d\s+()-]{7,32}$/, {
    message: 'Please enter a valid mobile number, including country code.',
  })
  mobile: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  currentLocation?: string;

  @Type(() => Number)
  @IsInt({ message: 'Please select your KSA residency status.' })
  residencyCode: number;

  // --- Section 03: background and qualifications --------------------------

  @Type(() => Number)
  @IsInt({ message: 'Please select your highest qualification.' })
  qualificationCode: number;

  /** EN, AR, HI, UR are the four the practice works in; others are accepted. */
  @IsArray()
  @ArrayNotEmpty({ message: 'Please list at least one working language.' })
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  workingLanguages: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  certifications?: string;

  @IsString()
  @MinLength(40, {
    message:
      'Please give us a little more background — at least 40 characters.',
  })
  @MaxLength(4000)
  backgroundSummary: string;

  // --- Anti-spam and attribution ------------------------------------------

  /** Hidden field. Bots fill it; real applicants leave it empty. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourcePage?: string;
}
