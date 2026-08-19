import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * The "Brief the practice" form on dataprivacy.veltrixair.com/contact/.
 *
 * Exactly the fields the live form collects, and no more. There is no consent
 * field: the form does not ask for one, because answering a business enquiry is
 * a pre-contractual step rather than something consent is the right basis for.
 * The service records LEGITIMATE_INTEREST on the row instead, so the reason is
 * written down rather than implied by the absence of a column.
 */
export class CreatePrivacyContactDto {
  @IsString()
  @IsNotEmpty({ message: 'Please tell us your name.' })
  @MaxLength(150)
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Please tell us which organisation you represent.' })
  @MaxLength(150)
  organisation: string;

  @IsEmail({}, { message: 'Please enter a valid work email address.' })
  @MaxLength(255)
  workEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  /** "Your role" — free text, since job titles in this field vary wildly. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  roleTitle?: string;

  /** Which law applies, not which country they are in. */
  @Type(() => Number)
  @IsInt({ message: 'Please select your primary jurisdiction.' })
  jurisdictionCode: number;

  @Type(() => Number)
  @IsInt({ message: 'Please select the service you are interested in.' })
  serviceCode: number;

  @IsString()
  @IsNotEmpty({ message: 'Please tell us briefly what you need.' })
  @MaxLength(2000, { message: 'Your brief cannot exceed 2000 characters.' })
  brief: string;

  // --- Anti-spam ---------------------------------------------------------

  /** Hidden field. Bots fill it; real submissions leave it empty. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
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
