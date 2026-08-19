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
  /** What's this about? — required */
  @Type(() => Number)
  @IsInt({ message: 'Please choose what this enquiry is about.' })
  topicCode: number;

  @IsString()
  @IsNotEmpty({ message: 'Please enter your full name.' })
  @MaxLength(150)
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Please enter your company.' })
  @MaxLength(150)
  company: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  roleTitle?: string;

  @IsEmail({}, { message: 'Please enter a valid work email.' })
  @MaxLength(255)
  workEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

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

  /** Tell us about your project — 1500 character cap, same as the counter. */
  @IsString()
  @IsNotEmpty({ message: 'Please tell us about your project.' })
  @MaxLength(1500, { message: 'Your message cannot exceed 1500 characters.' })
  message: string;

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
