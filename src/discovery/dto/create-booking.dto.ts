import {
  IsISO8601,
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Mirrors the three-section form on /talk-to-architect/. */
export class CreateBookingDto {
  /**
   * The date and hour chosen on the calendar, as a full ISO-8601 instant with
   * its offset — e.g. "2026-10-03T09:00:00+05:30".
   *
   * An offset is required rather than a bare "2026-10-03T09:00". A local time
   * with no offset has to be interpreted by whoever reads it, and the server's
   * own zone is the wrong answer; sending the instant removes the question.
   * Sessions run on India time, so in practice this is always +05:30.
   *
   * No slot and no architect: the website asks for a time, and who takes the
   * session is decided afterwards in the admin panel.
   */
  /*
   * The message names the shape on purpose. "Please choose a date and time"
   * reads as a prompt to the visitor, but this field is filled in by code, and
   * the mistake it actually catches is a caller sending a bare time or a local
   * datetime with no offset. Telling them what is expected is the difference
   * between a one-minute fix and a guess.
   */
  @IsISO8601(
    { strict: true },
    {
      message:
        'requestedStartAt must be a full date and time with its offset, ' +
        'e.g. 2026-11-17T15:00:00+05:30 — not a time on its own.',
    },
  )
  requestedStartAt: string;

  /**
   * The attendee's own IANA timezone, e.g. "Europe/London".
   *
   * Optional, and only ever used to word the confirmation: sessions are
   * scheduled in India time, and `requestedStartAt` already carries its offset,
   * so nothing about the booking depends on this. It is kept because an
   * attendee abroad reading "14:00 India time" has to do the arithmetic
   * themselves, and knowing their zone lets the email do it for them.
   *
   * Defaults to India time when absent, which is what the website sends.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  timezone?: string;

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

  /**
   * Required, matching the form — the booking pop-up keeps Confirm disabled
   * until the number validates for its country.
   *
   * Worth having beyond the email: a session is a time two people have to
   * both make, and the fastest way to tell somebody the architect is running
   * late is not a message in their inbox.
   */
  @IsString()
  @IsNotEmpty({ message: 'Please enter your phone number.' })
  @MaxLength(32)
  phone: string;

  /**
   * The dial code from the form's country picker, sent as "+91 IN". Declared
   * so it is not refused, and joined onto `phone` by the service — see
   * common/utils/phone.util.
   */
  @IsOptional()
  @IsString()
  @MaxLength(12)
  phoneCode?: string;

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
