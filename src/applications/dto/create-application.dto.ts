import { Transform } from 'class-transformer';
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
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ToBoolean } from '../../common/transformers/to-boolean.transformer';
import { ToOptionalAmount } from '../../common/transformers/to-optional-amount.transformer';
import { ToOptionalNumber } from '../../common/transformers/to-optional-number.transformer';
import { ToOptionalString } from '../../common/transformers/to-optional-string.transformer';

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

  /**
   * One field, matching the form. See JobApplication.fullName for why the name
   * is not split into two.
   */
  @IsString()
  @IsNotEmpty({ message: 'Please enter your full name.' })
  @MaxLength(100)
  fullName: string;

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
  @ToOptionalString()
  @IsString()
  @Matches(/^[\d\s+()-]{7,30}$/, {
    message: 'Please enter a valid phone number, including country code.',
  })
  phone?: string;

  /**
   * The dial code from the form's country picker, sent as "+91 IN" — dial, a
   * space, then the ISO code the picker uses to track its own selection.
   *
   * Declared here mainly so it is not refused: the global pipe runs with
   * `forbidNonWhitelisted`, so a field the form sends and the DTO does not
   * name is a 400, not something quietly dropped. Having declared it, the
   * better move is to use it — the service joins the dial half onto `phone`,
   * because a number without its country code is incomplete and asking the
   * browser to concatenate two fields it already has is work for no reason.
   *
   * Not stored on its own column. There is one phone number, not a number and
   * a prefix, and splitting it would invite the two to disagree.
   */
  @IsOptional()
  @ToOptionalString()
  @IsString()
  @MaxLength(12)
  phoneCode?: string;

  // --- Professional ------------------------------------------------------

  @IsOptional()
  @ToOptionalString()
  @IsString()
  @IsNotEmpty({ message: 'Please enter your current job title.' })
  @MaxLength(150)
  currentTitle?: string;

  @IsOptional()
  @ToOptionalString()
  @IsString()
  @MaxLength(150)
  currentCompany?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt({ message: 'Please select your highest qualification.' })
  qualificationCode?: number;

  /**
   * A band code from GET /apply-options, not a number of years.
   *
   * The form asks "how much experience" as a dropdown, so that is what arrives.
   * The years figure the admin list filters on is derived from the band's lower
   * bound by the service — it is not something a caller may set.
   */
  @IsOptional()
  @ToOptionalNumber()
  @IsInt({ message: 'Please select your total experience.' })
  experienceBandCode?: number;

  /**
   * Of the total, how much is in this discipline. The same list as above with
   * Fresher removed; sending Fresher here is refused by the service.
   */
  @IsOptional()
  @ToOptionalNumber()
  @IsInt({ message: 'Please select your relevant experience.' })
  relevantExperienceBandCode?: number;

  /**
   * Accepts either shape: repeated `keySkills` parts, or one comma-separated
   * string. The website's skill picker sends the second — `skills.join(', ')`
   * into a hidden field — and wrapping that in an array unsplit would store
   * "React, Node, TypeScript" as a single skill, which validates happily and
   * then never matches a search for "Node".
   *
   * Capped so a paste of someone's whole CV into the skills box does not
   * become five hundred entries in a GIN index. Blanks are dropped, so a
   * trailing comma does not become an empty skill.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown => {
    const parts = typeof value === 'string' ? value.split(',') : value;
    if (!Array.isArray(parts)) return parts;
    return parts
      .map((part: unknown) => (typeof part === 'string' ? part.trim() : part))
      .filter((part: unknown) => part !== '');
  })
  @IsArray()
  @ArrayMaxSize(30, { message: 'Please list no more than 30 skills.' })
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  keySkills?: string[];

  @IsOptional()
  @ToOptionalString()
  @IsUrl({}, { message: 'Please enter a valid URL, including https://' })
  @MaxLength(300)
  linkedinUrl?: string;

  @IsOptional()
  @ToOptionalString()
  @IsUrl({}, { message: 'Enter a valid portfolio or GitHub URL.' })
  @MaxLength(500)
  portfolioUrl?: string;

  // --- Logistics ---------------------------------------------------------

  @IsOptional()
  @ToOptionalString()
  @IsString()
  @IsNotEmpty({ message: 'Please enter the city you are based in.' })
  @MaxLength(100)
  city?: string;

  /**
   * A plain country name, as the form's text input sends it. Not a code —
   * see JobApplication.currentCountry for why this one left country_masters.
   */
  @IsOptional()
  @ToOptionalString()
  @IsString()
  @IsNotEmpty({ message: 'Please enter the country you are based in.' })
  @MaxLength(100)
  currentCountry?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt({ message: 'Please select your notice period.' })
  noticePeriodCode?: number;

  @IsOptional()
  @ToOptionalNumber()
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
  @ToOptionalString()
  @IsString()
  @MaxLength(60)
  currentCtc?: string;

  /** ISO 4217 for the figure above. The form sends it as a hidden field. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    // Empty means the picker was never touched — see ToOptionalString.
    return trimmed === '' ? undefined : trimmed.toUpperCase();
  })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currentCtcCurrency?: string;

  /** Numeric, because this one is filtered and compared across candidates. */
  @IsOptional()
  @ToOptionalAmount()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedSalary?: number;

  /** ISO 4217. Required alongside a salary — a bare number means nothing here. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    // Empty means the picker was never touched — see ToOptionalString.
    return trimmed === '' ? undefined : trimmed.toUpperCase();
  })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  salaryCurrency?: string;

  // --- Application -------------------------------------------------------

  @IsOptional()
  @ToOptionalString()
  @IsString()
  @MaxLength(4000, {
    message: 'Your cover note cannot exceed 4000 characters.',
  })
  coverNote?: string;

  @IsOptional()
  @ToOptionalNumber()
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
  @ToOptionalString()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @ToOptionalString()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;

  // --- Attribution -------------------------------------------------------

  @IsOptional()
  @ToOptionalString()
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
