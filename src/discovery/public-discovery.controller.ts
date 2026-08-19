import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentSite } from '../common/site/current-site.decorator';
import {
  DiscoveryPracticeOption,
  MasterDataService,
} from '../master-data/master-data.service';
import { BookingResult, BookingService } from './booking.service';
import { AvailabilityQueryDto, SlotsQueryDto } from './dto/list-bookings.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { DiscoveryBooking } from './entities/discovery-booking.entity';
import { DayAvailability, SlotOption, SlotService } from './slot.service';

/**
 * Anonymous surface for /talk-to-architect/.
 *
 * Every endpoint that deals in dates takes an explicit `timezone`, because
 * "which slots are on Tuesday?" has no answer until you know whose Tuesday.
 */
@ApiTags('Discovery (public)')
@Controller('discovery')
export class PublicDiscoveryController {
  constructor(
    private readonly slotService: SlotService,
    private readonly bookingService: BookingService,
    private readonly masterData: MasterDataService,
  ) {}

  /** "Pick a practice" — the six options and their architects. */
  @Get('practices')
  @ApiOperation({ summary: 'Practices available for a discovery session' })
  @ResponseMessage('Practices retrieved')
  practices(
    @CurrentSite() siteCode: number,
  ): Promise<DiscoveryPracticeOption[]> {
    return this.masterData.getDiscoveryPractices(siteCode);
  }

  /** Per-day density for the calendar grid, in the visitor's timezone. */
  @Get('availability')
  @ApiOperation({
    summary: 'Day-by-day availability density for the calendar grid',
  })
  @ResponseMessage('Availability retrieved')
  availability(
    @Query() query: AvailabilityQueryDto,
    @CurrentSite() siteCode: number,
  ): Promise<DayAvailability[]> {
    return this.slotService.availability(
      query.practiceCode,
      query.from,
      query.to,
      query.timezone,
      siteCode,
    );
  }

  /** Bookable times on one of the visitor's local days. */
  @Get('slots')
  @ApiOperation({ summary: 'Bookable slots for a given local date' })
  @ResponseMessage('Slots retrieved')
  slots(
    @Query() query: SlotsQueryDto,
    @CurrentSite() siteCode: number,
  ): Promise<SlotOption[]> {
    return this.slotService.slotsForDay(
      query.practiceCode,
      query.date,
      query.timezone,
      siteCode,
    );
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
