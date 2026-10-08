import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentSite } from '../common/site/current-site.decorator';
import { BookingResult, BookingService } from './booking.service';
import { TakenHoursQueryDto } from './dto/list-bookings.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { DiscoveryBooking } from './entities/discovery-booking.entity';

/**
 * Anonymous surface for /talk-to-architect/.
 *
 * Every endpoint that deals in dates takes an explicit `timezone`, because
 * "which slots are on Tuesday?" has no answer until you know whose Tuesday.
 */
@ApiTags('Discovery (public)')
@Controller('discovery')
export class PublicDiscoveryController {
  constructor(private readonly bookingService: BookingService) {}

  /*
   * GONE: `practices`, `availability` and `slots`.
   *
   * All three belonged to the original journey — pick a practice, see that
   * practice's architect, pick one of their free slots — and all three read
   * the architect-to-practice link that no longer exists. The visitor now asks
   * for an hour and the desk decides who takes it, so what is left below is
   * which hours are free and the booking itself.
   */

  /**
   * Which hours on a given day are already spoken for.
   *
   * What the booking calendar needs, and all it needs: sessions run every
   * calendar day on the hour in India time, one booking per hour, so a time is
   * offerable unless somebody already holds it. No architect is chosen at this
   * point — the desk assigns one afterwards — so there is nothing to look up
   * per-practice or per-diary.
   *
   * Returns the taken hours as "HH:00" strings in India time. The page already
   * knows the full list of hours it draws; this says which to grey out.
   */
  @Get('taken-hours')
  @ApiOperation({ summary: 'Hours already booked on a date (India time)' })
  @ResponseMessage('Taken hours retrieved')
  takenHours(
    @Query() query: TakenHoursQueryDto,
    @CurrentSite() siteCode: number,
  ): Promise<{ date: string; taken: string[] }> {
    return this.bookingService.takenHours(query.date, siteCode);
  }

  /** 5 bookings per hour per IP — this endpoint can block an architect's diary. */
  @Post('bookings')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Confirm a discovery session' })
  @ResponseMessage('Booking confirmed')
  book(
    @Body() dto: CreateBookingDto,
    @Req() request: Request,
    @CurrentSite() siteCode: number,
  ): Promise<BookingResult> {
    return this.bookingService.book(
      dto,
      { ip: request.ip, userAgent: request.get('user-agent') },
      siteCode,
    );
  }

  /** The attendee's own view — the token arrives in their confirmation email. */
  @Get('bookings/:token')
  @ApiOperation({ summary: 'View a booking by its manage token' })
  @ResponseMessage('Booking retrieved')
  findByToken(
    @Param('token') token: string,
    @CurrentSite() siteCode: number,
  ): Promise<DiscoveryBooking> {
    return this.bookingService.findByToken(token, siteCode);
  }

  @Post('bookings/:token/cancel')
  @ApiOperation({ summary: 'Cancel a booking — releases the slot' })
  @ResponseMessage('Booking cancelled')
  cancel(
    @Param('token') token: string,
    @CurrentSite() siteCode: number,
  ): Promise<{ message: string }> {
    return this.bookingService.cancelByToken(token, siteCode);
  }
}
