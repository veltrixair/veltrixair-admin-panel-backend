import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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
  practiceCode?: number;

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
 * Emergency cover: hand the session to someone else at the same hour.
 *
 * Only the architect is named. The time is deliberately not settable — the
 * attendee chose that hour around their own diary, so moving it solves our
 * problem by creating theirs.
 */
export class ReassignBookingDto {
  @IsUUID()
  architectId: string;
}

export class UpdateBookingStatusDto {
  @IsIn(BOOKING_STATUSES)
  status: BookingStatus;
}

/**
 * Query for the calendar grid.
 *
 * `from`/`to` are the VISITOR's local dates, and `timezone` is what makes that
 * meaningful — a slot at 09:00 Riyadh belongs to the previous calendar day for
 * someone in Los Angeles, so the grouping has to know whose days these are.
 */
export class AvailabilityQueryDto {
  @Type(() => Number)
  @IsInt()
  practiceCode: number;

  @IsISO8601({ strict: false })
  from: string;

  @IsISO8601({ strict: false })
  to: string;

  @IsString()
  @IsNotEmpty({ message: 'A timezone is required.' })
  @MaxLength(64)
  timezone: string;
}

export class SlotsQueryDto {
  @Type(() => Number)
  @IsInt()
  practiceCode: number;

  /** The visitor's local date, `YYYY-MM-DD`. */
  @IsISO8601({ strict: false })
  date: string;

  @IsString()
  @IsNotEmpty({ message: 'A timezone is required.' })
  @MaxLength(64)
  timezone: string;
}

export class GenerateSlotsDto {
  @IsISO8601({ strict: false })
  from: string;

  @IsISO8601({ strict: false })
  to: string;
}
