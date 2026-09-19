import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { KNODE_DEMO_INTENTS } from '../entities/knode-demo-request.entity';
import type { KnodeDemoIntent } from '../entities/knode-demo-request.entity';

/**
 * A "Book a demo" submission.
 *
 * The rules here are lifted from the validation the kNODE site already runs in
 * the browser, so a field the visitor was allowed to leave blank is optional
 * here too. Client-side validation is a courtesy, not a guarantee — these are
 * the same rules enforced where they count.
 *
 * `intent` is the visitor's own answer and is honoured exactly as sent.
 */
export class CreateDemoRequestDto {
  /**
   * The "Live demo / Notify me" radio, as the visitor left it.
   *
   * Optional, and absent means DEMO — which is what the website's radio
   * defaults to, and what the short form on a product page implies.
   *
   * Honoured in every case, and it alone decides which of the two lists the
   * request lands in. Whether the modules picked are live or still pending
   * changes nothing: DEMO goes to the demo pipeline, NOTIFY to the notify
   * list, and the server never moves a request from one to the other.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(KNODE_DEMO_INTENTS)
  intent?: KnodeDemoIntent;

  /**
   * At least one, because a request about nothing is not a request.
   *
   * Capped at the number of modules that exist — a longer array is either a
   * mistake or somebody probing.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  moduleCodes: number[];

  // --- the facility -------------------------------------------------------

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  facilityName: string;

  @Type(() => Number)
  @IsInt()
  facilityTypeCode: number;

  @Type(() => Number)
  @IsInt()
  bedBandCode: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  opdBandCode?: number;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city: string;

  // --- the person ---------------------------------------------------------

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  contactPerson: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contactRoleCode?: number;

  /**
   * Ten digits, or twelve beginning 91 — an Indian mobile with or without its
   * country code. Spaces, dashes and a leading + are stripped before this
   * runs, so the visitor can type the number however they hold it in their
   * head.
   */
  @Matches(/^(?:91)?[6-9]\d{9}$/, {
    message:
      'phone must be a 10-digit Indian mobile, optionally prefixed with 91',
  })
  phone: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  callWindowCode?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // --- provenance ---------------------------------------------------------

  /** Which page the form was on. Sent by the site, never trusted for routing. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  sourcePage?: string;

  /**
   * Both optional only because the kNODE site has no consent checkbox yet.
   * The moment it does, send these and the record becomes as defensible as
   * every other form in this codebase.
   */
  @IsOptional()
  consentGiven?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  privacyNoticeVersion?: string;

  /** Hidden field a human never sees. Present for when the site adds one. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  honeypot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  captchaToken?: string;
}
