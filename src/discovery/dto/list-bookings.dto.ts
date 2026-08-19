import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { BOOKING_STATUSES } from '../entities/discovery-booking.entity';
import type { BookingStatus } from '../entities/discovery-booking.entity';

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
