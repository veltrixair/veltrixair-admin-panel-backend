import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ToBoolean } from '../../../common/transformers/to-boolean.transformer';
import { VISIT_EXISTING_CLIENT } from '../entities/crane-site-visit.entity';
import type { VisitExistingClient } from '../entities/crane-site-visit.entity';

/**
 * The site visit request form.
 *
 * JSON rather than multipart — this page has no file upload — so numbers and
 * booleans arrive as their real types and need far less coercion than the
 * quote form. @Type is still applied so the same body works if a frontend
 * posts form-encoded.
 */
export class CreateCraneSiteVisitDto {
  // --- Section 01: visit purpose ------------------------------------------

  @Type(() => Number)
  @IsInt({ message: 'Please choose why you need a site visit.' })
  visitPurposeCode: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceLineCode?: number;

  @Type(() => Number)
  @IsInt({ message: 'Please tell us how soon you need the visit.' })
  visitUrgencyCode: number;

  /** The one required free-text field on the page. */
  @IsString()
  @IsNotEmpty({ message: 'Please tell us what the engineer should focus on.' })
  @MaxLength(5000)
  engineerFocus: string;

  /** Set when the visit is being scoped out of an existing quote enquiry. */
  @IsOptional()
  @IsUUID('4', { message: 'quoteId must be a valid quote id' })
  quoteId?: string;

  // --- Section 02: company and contact ------------------------------------

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

  @IsString()
  @Matches(/^[\d\s+()-]{7,30}$/, {
    message: 'Please enter a valid mobile number, including country code.',
  })
  mobile: string;

  @IsIn(VISIT_EXISTING_CLIENT, {
    message: `existingClient must be one of: ${VISIT_EXISTING_CLIENT.join(', ')}`,
  })
  existingClient: VisitExistingClient;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  leadSourceCode?: number;

  // --- Section 03: site and asset snapshot --------------------------------

  @Type(() => Number)
  @IsInt({ message: 'Please select the site city or region.' })
  siteCityCode: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  siteAccessCode?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  siteAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  siteContactName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[\d\s+()-]{7,30}$/, {
    message: 'Please enter a valid site contact number.',
  })
  siteContactPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  craneCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  craneTypeCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  oemCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ageBandCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  environmentCode?: number;

  // --- Section 04: scheduling ---------------------------------------------

  /**
   * Free text, not dates. "After Eid", "w/c 14th" and "any Tuesday" are all
   * real answers, and a date picker would force people to invent precision
   * they do not have.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  preferredDates?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  avoidDates?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  visitDurationCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  visitTimeCode?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attendees?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  agendaItems?: string;

  // --- Section 05: access and compliance ----------------------------------

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  accessApprovalCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  engineerVisaCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ppeProviderCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  hotWorkCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  translatorCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  engagementTypeCode?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  siteConstraints?: string;

  // --- Consent -------------------------------------------------------------

  @ToBoolean()
  @IsBoolean()
  @Equals(true, {
    message:
      'You must consent to us processing this information to coordinate a visit.',
  })
  consentGiven: boolean;

  /**
   * Genuinely separate from the primary consent. On a defence or Aramco site,
   * whether an engineer may take photographs is a different question from
   * whether you may hold someone's contact details.
   */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  photographyConsent?: boolean;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  marketingOptIn?: boolean;

  // --- Anti-spam and attribution ------------------------------------------

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
