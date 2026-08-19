import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ToBoolean } from '../../common/transformers/to-boolean.transformer';

/**
 * The apply form behind the "Apply" button on a job card.
 *
 * Arrives as multipart, not JSON, because the résumé travels with it — so every
 * scalar reaches us as a string and needs @Type or @Transform to coerce. That
 * is why numeric and boolean fields look noisier here than on the contact DTO.
 *
 * Almost everything is optional here, which is not the same as "not required".
 * A posting decides which questions it asks and which of those must be answered
 * — see application-fields.constants.ts — and that is a per-role rule a static
 * DTO cannot express. The service enforces it once the posting is known, so
 * this class validates only the SHAPE of an answer, never its presence. The
 * four in ALWAYS_ON are the exception: name, email, résumé and consent are
 * required of every applicant to every role.
 */
export class CreateApplicationDto {
  // --- Identity ----------------------------------------------------------

  @IsString()
  @IsNotEmpty({ message: 'Please enter your first name.' })
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Please enter your last name.' })
  @MaxLength(100)
  lastName: string;

  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MaxLength(255)
  email: string;

  /**
   * Deliberately permissive: digits, spaces, +, -, ( and ). Candidates write
   * numbers in a dozen formats across three countries, and rejecting a real
   * applicant over a bracket is a worse outcome than storing an odd string.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[\d\s+()-]{7,30}$/, {
    message: 'Please enter a valid phone number, including country code.',
  })
  phone?: string;

  // --- Professional ------------------------------------------------------

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Please enter your current job title.' })
  @MaxLength(150)
  currentTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  currentCompany?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Please select your highest qualification.' })
  qualificationCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0, { message: 'Experience cannot be negative.' })
  @Max(60, { message: 'Please enter your experience in years.' })
  experienceYears?: number;

  /** Of the total, how much is in this discipline. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0, { message: 'Experience cannot be negative.' })
  @Max(60)
  relevantExperienceYears?: number;

  /**
   * Sent as repeated `keySkills` parts in the multipart body. Capped so a paste
   * of someone's whole CV into the skills box does not become five hundred
   * entries in a GIN index.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? [value] : value,
  )
  @IsArray()
  @ArrayMaxSize(30, { message: 'Please list no more than 30 skills.' })
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  keySkills?: string[];

  @IsOptional()
  @IsUrl({}, { message: 'Please enter a valid URL, including https://' })
  @MaxLength(300)
  linkedinUrl?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Enter a valid portfolio or GitHub URL.' })
  @MaxLength(500)
  portfolioUrl?: string;

  // --- Logistics ---------------------------------------------------------

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Please enter the city you are based in.' })
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Please select your country.' })
  countryCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Please select your notice period.' })
  noticePeriodCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Please tell us your right to work in this location.' })
  workAuthorisationCode?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  willingToRelocate?: boolean;

  // --- Money -------------------------------------------------------------

  /**
   * Free text, unlike expectedSalary. "Negotiable" and "confidential" are real
   * answers to what someone earns now, and a numeric field throws them away.
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  currentCtc?: string;

  /** Numeric, because this one is filtered and compared across candidates. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedSalary?: number;

  /** ISO 4217. Required alongside a salary — a bare number means nothing here. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  salaryCurrency?: string;

  // --- Application -------------------------------------------------------

  @IsOptional()
  @IsString()
  @MaxLength(4000, {
    message: 'Your cover note cannot exceed 4000 characters.',
  })
  coverNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sourceCode?: number;

  // --- Consent -----------------------------------------------------------

  /**
   * Multipart sends "true"/"false" as text, so this coerces before validating.
   * Must use ToBoolean rather than a plain @Transform — see that file for why
   * reading `value` here silently turns "false" into true.
   *
   * Required: the résumé is retained for twelve months, which needs a lawful
   * basis recorded at the moment it was given.
   */
  @ToBoolean()
  @IsBoolean()
  @Equals(true, {
    message: 'You must agree to the Privacy Notice before applying.',
  })
  consentGiven: boolean;

  // --- Anti-spam ---------------------------------------------------------

  /** Hidden field. Bots fill it; real applicants leave it empty. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;

  // --- Attribution -------------------------------------------------------

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourcePage?: string;

  /**
   * Never read — the file is consumed by FileInterceptor before validation, and
   * the controller still rejects a missing resume. Declared only so that a
   * client appending an empty `resume` field does not trip forbidNonWhitelisted
   * with "property resume should not exist", which is a baffling error for a
   * field that is part of the contract. Postman sends exactly that when the row
   * is present with no file chosen.
   */
  @IsOptional()
  resume?: unknown;
}
