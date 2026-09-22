import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ToBoolean } from '../../../common/transformers/to-boolean.transformer';
import {
  EXISTING_CLIENT,
  PREFERRED_CONTACT,
} from '../entities/crane-quote-request.entity';
import type {
  ExistingClient,
  PreferredContact,
} from '../entities/crane-quote-request.entity';

/**
 * Multipart carries everything as text, so a list of checkbox codes arrives
 * either as repeated fields (`additionalServices=101&additionalServices=103`)
 * or as one comma-separated value, depending on how the form is built. Accept
 * both rather than dictating to the frontend.
 */
function toCodeArray({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  const raw: unknown[] =
    typeof value === 'string'
      ? value.split(',')
      : Array.isArray(value)
        ? value
        : [value];
  return raw
    .map((v) => Number(typeof v === 'string' ? v.trim() : v))
    .filter((n) => Number.isInteger(n));
}

/** Section 04 arrives as a JSON string in a multipart field. */
function toScopeObject({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Leave it as-is so @IsObject reports a useful error rather than a 500.
    return value;
  }
}

export class CreateCraneQuoteDto {
  // --- Section 01: service required --------------------------------------

  @Type(() => Number)
  @IsInt({ message: 'Please choose the service you need.' })
  serviceLineCode: number;

  @IsOptional()
  @Transform(toCodeArray)
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  additionalServiceCodes?: number[];

  @Type(() => Number)
  @IsInt({ message: 'Please tell us how urgent this is.' })
  urgencyCode: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  leadSourceCode?: number;

  // --- Section 02: company and contact -----------------------------------

  @IsString()
  @IsNotEmpty({ message: 'Please enter your company name.' })
  @MaxLength(200)
  companyName: string;

  @Type(() => Number)
  @IsInt({ message: 'Please select your industry sector.' })
  industryCode: number;

  @IsString()
  @IsNotEmpty({ message: 'Please enter your name.' })
  @MaxLength(150)
  contactName: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactPosition?: string;

  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Please enter a valid business email.' })
  @MaxLength(255)
  businessEmail: string;

  /** Permissive on format — KSA numbers get written a dozen ways. */
  @IsString()
  @Matches(/^[\d\s+()-]{7,30}$/, {
    message: 'Please enter a valid mobile number, including country code.',
  })
  mobile: string;

  @IsIn(EXISTING_CLIENT, {
    message: `existingClient must be one of: ${EXISTING_CLIENT.join(', ')}`,
  })
  existingClient: ExistingClient;

  @IsIn(PREFERRED_CONTACT, {
    message: `preferredContact must be one of: ${PREFERRED_CONTACT.join(', ')}`,
  })
  preferredContact: PreferredContact;

  // --- Section 03: site and asset ----------------------------------------

  @Type(() => Number)
  @IsInt({ message: 'Please select the site city or region.' })
  siteCityCode: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  siteAccessCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  craneCount?: number;

  @Type(() => Number)
  @IsInt({ message: 'Please select the crane type.' })
  craneTypeCode: number;

  @Type(() => Number)
  @IsInt({ message: 'Please select the OEM or brand.' })
  oemCode: number;

  /** "32 t", or "10 + 20 + 32 t" when the request covers several cranes. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  swlTonnes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  yearOfManufacture?: number;

  @Type(() => Number)
  @IsInt({ message: 'Please select the operating environment.' })
  environmentCode: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  spanLiftHeight?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dutyClassCode?: number;

  // --- Section 04: the service-specific questionnaire --------------------

  /**
   * Validated against SCOPE_SCHEMAS for the chosen service line — see
   * crane-quote.constants.ts. Unknown keys, unknown values, or answers
   * belonging to a different service line are rejected.
   */
  @IsOptional()
  @Transform(toScopeObject)
  @IsObject({ message: 'scopeDetail must be a JSON object' })
  scopeDetail?: Record<string, unknown>;

  // --- Section 05: commercial context ------------------------------------

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  budgetBandCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  completionTimelineCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  procurementCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  paymentTermsCode?: number;

  @IsOptional()
  @Transform(toCodeArray)
  @IsArray()
  @ArrayMaxSize(15)
  @ArrayUnique()
  @IsInt({ each: true })
  requiredDocumentCodes?: number[];

  @IsString()
  @IsNotEmpty({ message: 'Please describe the project.' })
  @MaxLength(5000)
  projectDescription: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  constraintsConcerns?: string;

  // --- Consent -----------------------------------------------------------

  /**
   * The PDPL consent. Required — the quote record carries named contacts and
   * commercial detail, retained for the engagement plus statutory periods.
   */
  @ToBoolean()
  @IsBoolean()
  @Equals(true, {
    message: 'You must consent to us processing this information to quote.',
  })
  consentGiven: boolean;

  /** Separate and genuinely optional: the quarterly KSA regulatory update. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  marketingOptIn?: boolean;

  // --- Anti-spam and attribution -----------------------------------------

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

  /**
   * Never read — the files are consumed by FilesInterceptor before validation.
   *
   * Declared so that a client appending an empty `attachments` field does not
   * trip forbidNonWhitelisted with "property attachments should not exist",
   * which is a baffling error for a field that is part of the contract.
   * Postman sends exactly that when the row is present with no file chosen.
   */
  @IsOptional()
  attachments?: unknown;
}
