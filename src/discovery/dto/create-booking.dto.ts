import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Mirrors the three-section form on /talk-to-architect/. */
export class CreateBookingDto {
  /** The slot chosen from the calendar. */
  @IsUUID()
  slotId: string;

  /**
   * The attendee's IANA timezone, e.g. "Asia/Kolkata".
   * The frontend sends Intl.DateTimeFormat().resolvedOptions().timeZone.
   * Required because the confirmation email and calendar invite have no
   * browser to convert for them.
   */
  @IsString()
  @IsNotEmpty({ message: 'A timezone is required to confirm the session.' })
  @MaxLength(64)
  timezone: string;

  @IsString()
  @IsNotEmpty({ message: 'Please enter your full name.' })
  @MaxLength(150)
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Please enter your company.' })
  @MaxLength(150)
  company: string;

  @IsString()
  @IsNotEmpty({ message: 'Please enter your role or title.' })
  @MaxLength(150)
  roleTitle: string;

  @IsEmail({}, { message: 'Please enter a valid work email.' })
  @MaxLength(255)
  workEmail: string;

  /** "What's the programme?" */
  @IsString()
  @IsNotEmpty({ message: 'Please tell us about the programme.' })
  @MaxLength(2000)
  programme: string;

  /**
   * "This conversation will involve confidential information. Please send a
   * mutual NDA before the session."
   */
  @IsOptional()
  @IsBoolean()
  requiresNda?: boolean;

  @IsBoolean()
  @Equals(true, {
    message: 'You must agree to the Privacy Notice before booking.',
  })
  consentGiven: boolean;

  // --- Anti-spam ---------------------------------------------------------

  /** Hidden honeypot. */
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
