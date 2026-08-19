import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** The exchange for a gated asset — deliberately shorter than the contact form. */
export class GatedDownloadDto {
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

  @IsBoolean()
  @Equals(true, {
    message: 'You must agree to the Privacy Notice before downloading.',
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
