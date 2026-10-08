import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Mirrors the "Send Us a Detailed Enquiry" form on /contact-us/ exactly.
 * Validation messages match the ones the page already shows so the frontend
 * can surface server errors verbatim.
 */
export class CreateEnquiryDto {
  @IsString()
  @IsNotEmpty({ message: 'Please enter your full name.' })
  @MaxLength(150)
  fullName: string;

  /** Optional, matching the form. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  roleTitle?: string;

  @IsEmail({}, { message: 'Please enter a valid work email.' })
  @MaxLength(255)
  workEmail: string;

  /** Required, matching the form. */
  @IsString()
  @IsNotEmpty({ message: 'Please enter your phone number.' })
  @MaxLength(32)
  phone: string;

  /** Country / Jurisdiction — required */
  @Type(() => Number)
  @IsInt({ message: 'Please select your country.' })
  countryCode: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  industryCode?: number;

  /** When do you need this? */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  timelineCode?: number;

  /**
   * Tell us about your project — 1500 character cap, same as the counter.
   *
   * Optional, matching the form. An enquiry with no message is thin, but the
   * name, company and country still say who is asking and from where, and
   * refusing it would lose a lead over a box the page never marked required.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1500, { message: 'Your message cannot exceed 1500 characters.' })
  message?: string;

  /** "…includes confidential information. Please send a mutual NDA…" */
  @IsOptional()
  @IsBoolean()
  requiresNda?: boolean;

  /**
   * "I agree that Veltrixair may process the information above to respond to
   * my enquiry, in accordance with the Privacy Notice." Required — the request
   * is rejected without it, and the acceptance is recorded as a consent record.
   */
  @IsBoolean()
  @Equals(true, {
    message: 'You must agree to the Privacy Notice before we can respond.',
  })
  consentGiven: boolean;

  // --- Anti-spam ---------------------------------------------------------

  /** Hidden field. Bots fill it; real submissions leave it empty. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  /** Cloudflare Turnstile token. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;

  // --- Attribution -------------------------------------------------------

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourcePage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmCampaign?: string;
}
