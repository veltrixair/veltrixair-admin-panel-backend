import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { BOOKING_STATUSES } from '../entities/discovery-booking.entity';
import type { BookingStatus } from '../entities/discovery-booking.entity';

/**
 * Which end of the diary to read from.
 *
 * A booking list spans past and future, so neither direction is right on its
 * own: `soonest` puts the oldest finished session first, `latest` puts the
 * furthest-off one first. Pairing it with `from`/`to` is what makes it useful —
 * "upcoming, soonest first" is `from=<now>&sort=soonest`.
 */
export const BOOKING_SORTS = ['soonest', 'latest'] as const;
export type BookingSort = (typeof BOOKING_SORTS)[number];

export class ListBookingsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: BookingStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  industryCode?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  /** One architect's diary. */
  @IsOptional()
  @IsUUID()
  architectId?: string;

  /** Sessions starting at or after this instant. */
  @IsOptional()
  @IsISO8601({ strict: false })
  from?: string;

  /** Sessions starting at or before this instant. */
  @IsOptional()
  @IsISO8601({ strict: false })
  to?: string;

  /** Defaults to `latest`, which is how this list has always ordered. */
  @IsOptional()
  @IsIn(BOOKING_SORTS)
  sort?: BookingSort;
}

/**
 * Give the session an architect — the first one, or a different one.
 *
 * Only the architect is named. Moving the hour is a separate action with its
 * own letter to the attendee — see RescheduleBookingDto. Keeping them apart is
 * the point: changing who takes a session is routine, changing when it happens
 * rearranges somebody else's diary, and the two should not share one button.
 */
export class AssignBookingDto {
  @IsUUID()
  architectId: string;
}

/**
 * Move a session to another hour.
 *
 * For a time the attendee has already agreed to. The backend cannot tell an
 * arrangement from a unilateral move, so it does the one thing it can: it
 * writes to them every time, naming both hours, rather than letting a session
 * slide silently.
 *
 * `reason` is optional and goes to the attendee verbatim when given. Not
 * required, because by the time the desk edits this the why has usually been
 * said on a call — but a move with no explanation at all reads badly, so give
 * one unless they already know.
 */
export class RescheduleBookingDto {
  @IsISO8601(
    { strict: true },
    {
      message:
        'requestedStartAt must be a full date and time with its offset, ' +
        'e.g. 2026-11-17T15:00:00+05:30 — not a time on its own.',
    },
  )
  requestedStartAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * An internal note on a booking.
 *
 * Internal in the strict sense: it is never sent to the attendee and never
 * leaves the panel. Append-only too — the timeline is a record of what was
 * thought at the time, and one that can be edited afterwards is not.
 */
export class AddBookingNoteDto {
  @IsString()
  @MinLength(1, { message: 'Write something before saving the note.' })
  @MaxLength(2000)
  note: string;
}

export class UpdateBookingStatusDto {
  @IsIn(BOOKING_STATUSES)
  status: BookingStatus;
}

/**
 * One calendar day, India time. No practice and no timezone: sessions are
 * scheduled in one zone and the architect is chosen afterwards, so neither
 * narrows the answer.
 */
export class TakenHoursQueryDto {
  /** `YYYY-MM-DD`, read as an India-time date. */
  @IsISO8601({ strict: false })
  date: string;
}

export class GenerateSlotsDto {
  @IsISO8601({ strict: false })
  from: string;

  @IsISO8601({ strict: false })
  to: string;
}
