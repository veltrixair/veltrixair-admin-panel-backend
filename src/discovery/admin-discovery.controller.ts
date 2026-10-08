import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FEATURE, PERMISSION } from '../auth/permissions.constants';
import type { AuthenticatedAdmin } from '../auth/permissions.constants';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ArchitectService } from './architect.service';
import { BookingService } from './booking.service';
import type { AssignmentOption } from './booking.service';
import {
  GenerateSlotsDto,
  ListBookingsDto,
  AddBookingNoteDto,
  AssignBookingDto,
  RescheduleBookingDto,
  TakenHoursQueryDto,
  UpdateBookingStatusDto,
} from './dto/list-bookings.dto';
import {
  AssignIndustriesDto,
  CreateArchitectDto,
  CreateBlackoutDto,
  ReplaceAvailabilityDto,
  UpdateArchitectDto,
} from './dto/upsert-architect.dto';
import { ArchitectIndustryMaster } from '../master-data/entities/architect-industry-master.entity';
import { ArchitectAvailabilityRule } from './entities/architect-availability-rule.entity';
import { ArchitectBlackout } from './entities/architect-blackout.entity';
import { Architect } from './entities/architect.entity';
import { DiscoveryBookingEvent } from './entities/discovery-booking-event.entity';
import { DiscoveryBooking } from './entities/discovery-booking.entity';
import { SlotService } from './slot.service';

/**
 * Sales owns this surface. Architects, availability and blackouts sit under the
 * same DISCOVERY feature as bookings — carving them into their own feature code
 * would be dividing what one team administers.
 */
@ApiTags('Discovery (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard)
@Controller('admin/discovery')
export class AdminDiscoveryController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly slotService: SlotService,
    private readonly architectService: ArchitectService,
  ) {}

  @Get('bookings')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.VIEW)
  @ApiOperation({ summary: 'List bookings (excludes the programme text)' })
  @ResponseMessage('Bookings retrieved')
  list(
    @Query() query: ListBookingsDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PaginatedResult<DiscoveryBooking>> {
    return this.bookingService.list(query, admin.siteCode);
  }

  @Get('bookings/:id')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'Read one booking in full, including the programme',
  })
  @ResponseMessage('Booking retrieved')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<DiscoveryBooking> {
    return this.bookingService.findById(id, admin.siteCode);
  }

  /**
   * Record the outcome.
   *
   * Setting BOOKED on a session with no architect is refused: a session is
   * confirmed by assigning somebody, not by choosing the word. The 409 carries
   * a message written for whoever picked it, so the panel can show it as it
   * stands rather than inventing its own wording.
   */
  @Patch('bookings/:id/status')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.UPDATE)
  @ApiOperation({
    summary:
      'Update the outcome — Booked requires an architect; cancelling releases the slot',
  })
  @ResponseMessage('Status updated')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<DiscoveryBooking> {
    return this.bookingService.setStatus(
      id,
      dto.status,
      admin.email,
      admin.siteCode,
    );
  }

  @Get('bookings/:id/events')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Timeline for a booking, oldest first' })
  @ResponseMessage('Events retrieved')
  listEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<DiscoveryBookingEvent[]> {
    return this.bookingService.listEvents(id, admin.siteCode);
  }

  @Post('bookings/:id/notes')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Append an internal note — never sent to the attendee',
  })
  @ResponseMessage('Note added')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddBookingNoteDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<DiscoveryBookingEvent> {
    return this.bookingService.addNote(
      id,
      dto.note,
      admin.email,
      admin.siteCode,
    );
  }

  @Get('bookings/:id/assignment-options')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'Architects this session can be given to, and who is free',
  })
  @ResponseMessage('Options retrieved')
  assignmentOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<AssignmentOption[]> {
    return this.bookingService.assignmentOptions(id, admin.siteCode);
  }

  /**
   * Give the session an architect.
   *
   * The one assignment action, used both for a request that has nobody and for
   * changing who holds a confirmed session — the only difference between those
   * was ever whether a previous architect existed, so the panel offers one
   * button. The hour never moves: the attendee chose it around their own
   * diary, and if nobody can take it the answer is to talk to them.
   */
  @Patch('bookings/:id/assign')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Assign (or change) the architect for a session' })
  @ResponseMessage('Architect assigned')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignBookingDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<DiscoveryBooking> {
    return this.bookingService.assign(
      id,
      dto.architectId,
      admin.email,
      admin.siteCode,
    );
  }

  /**
   * Which hours on a day are already spoken for.
   *
   * The same answer the website's calendar gets, on the admin side so the
   * reschedule picker can grey out the hours that would be refused. Without
   * it the desk picks blind and learns the hour was taken from a 409.
   *
   * The session's own hour counts as taken, which is correct: a reschedule to
   * the time it already has is not a move.
   */
  @Get('taken-hours')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Hours already booked on a date (India time)' })
  @ResponseMessage('Taken hours retrieved')
  takenHours(
    @Query() query: TakenHoursQueryDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ date: string; taken: string[] }> {
    return this.bookingService.takenHours(query.date, admin.siteCode);
  }

  /**
   * Move a session to another hour.
   *
   * Its own endpoint rather than a field on assign: reassigning an architect
   * is routine and rescheduling rearranges somebody else's day, so they are
   * kept apart deliberately. The attendee is emailed both hours every time.
   *
   * The new time passes the same checks the public form does — on the hour,
   * inside the session window, not in the past, and not an hour somebody else
   * already holds.
   */
  @Patch('bookings/:id/reschedule')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Move a session to another date and time' })
  @ResponseMessage('Session rescheduled')
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleBookingDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<DiscoveryBooking> {
    return this.bookingService.reschedule(id, dto, admin.email, admin.siteCode);
  }

  /**
   * Rolls the bookable window forward. Idempotent — re-running over an
   * overlapping range inserts nothing new, so this is safe to schedule.
   */
  @Post('slots/generate')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.CREATE)
  @ApiOperation({ summary: 'Generate session slots for a date range' })
  @ResponseMessage('Slots generated')
  generate(
    @Body() dto: GenerateSlotsDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ created: number; skipped: number }> {
    return this.slotService.generate(dto.from, dto.to, admin.siteCode);
  }

  // -----------------------------------------------------------------------
  // Architects
  // -----------------------------------------------------------------------

  /**
   * The industry dropdown for the architect form.
   *
   * Served rather than hardcoded in the panel, for the reason the careers
   * forms learned the hard way: a list kept in two places drifts, and the copy
   * nobody is looking at is the one that goes stale.
   */
  @Get('architect-industries')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Industry options for the architect form' })
  @ResponseMessage('Industries retrieved')
  architectIndustries(
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<ArchitectIndustryMaster[]> {
    return this.architectService.listIndustries(admin.siteCode);
  }

  @Get('architects')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.VIEW)
  @ApiOperation({ summary: 'List architects' })
  @ResponseMessage('Architects retrieved')
  listArchitects(
    @CurrentUser() admin: AuthenticatedAdmin,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<Architect[]> {
    return this.architectService.list(
      includeInactive === 'true',
      admin.siteCode,
    );
  }

  @Get('architects/:id')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Get one architect' })
  @ResponseMessage('Architect retrieved')
  getArchitect(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<Architect> {
    return this.architectService.findById(id, admin.siteCode);
  }

  @Post('architects')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.CREATE)
  @ApiOperation({ summary: 'Create an architect' })
  @ResponseMessage('Architect created')
  createArchitect(
    @Body() dto: CreateArchitectDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<Architect> {
    return this.architectService.create(dto, admin.siteCode);
  }

  @Patch('architects/:id')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Update an architect — name, credentials, practice or office',
  })
  @ResponseMessage('Architect updated')
  updateArchitect(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArchitectDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<Architect> {
    return this.architectService.update(id, dto, admin.siteCode);
  }

  /**
   * Replace the industries an architect covers.
   *
   * Separate from the general update so the panel can offer it on its own,
   * and because it is the one field that is a set rather than a value — sent
   * whole, never patched item by item.
   */
  @Put('architects/:id/industries')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Assign the industries an architect covers (one or more)',
  })
  @ResponseMessage('Industries assigned')
  assignIndustries(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignIndustriesDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ) {
    return this.architectService.assignIndustries(id, dto, admin.siteCode);
  }

  @Delete('architects/:id')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.DELETE)
  @ApiOperation({
    summary: 'Deactivate — refuses while upcoming sessions exist',
  })
  @ResponseMessage('Architect deactivated')
  deactivateArchitect(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ message: string }> {
    return this.architectService.deactivate(id, admin.siteCode);
  }

  // -----------------------------------------------------------------------
  // Weekly availability
  // -----------------------------------------------------------------------

  @Get('architects/:id/availability')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.VIEW)
  @ApiOperation({ summary: "An architect's weekly pattern" })
  @ResponseMessage('Availability rules retrieved')
  listRules(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<ArchitectAvailabilityRule[]> {
    return this.architectService.listRules(id, admin.siteCode);
  }

  /**
   * Replaces the weekly pattern. A weekly off day is an absent weekday.
   * Future FREE slots are cleared; BOOKED and BLOCKED ones survive.
   */
  @Put('architects/:id/availability')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Replace the weekly availability pattern' })
  @ResponseMessage('Availability updated')
  replaceAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceAvailabilityDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ) {
    return this.architectService.replaceAvailability(id, dto, admin.siteCode);
  }

  // -----------------------------------------------------------------------
  // Blackouts — leave, holidays, commitments
  // -----------------------------------------------------------------------

  @Get('blackouts')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.VIEW)
  @ApiOperation({ summary: 'List blackouts' })
  @ResponseMessage('Blackouts retrieved')
  listBlackouts(
    @CurrentUser() admin: AuthenticatedAdmin,
    @Query('architectId') architectId?: string,
  ): Promise<ArchitectBlackout[]> {
    return this.architectService.listBlackouts(admin.siteCode, architectId);
  }

  /** Omit `architectId` for a firm-wide closure. Returns 409 on a booked clash. */
  @Post('blackouts')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.CREATE)
  @ApiOperation({
    summary: 'Add a blackout — 409 if it covers a confirmed session',
  })
  @ResponseMessage('Blackout added')
  createBlackout(
    @Body() dto: CreateBlackoutDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ) {
    return this.architectService.createBlackout(dto, admin.siteCode);
  }

  @Delete('blackouts/:id')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.DELETE)
  @ApiOperation({ summary: 'Remove a blackout and reopen its slots' })
  @ResponseMessage('Blackout removed')
  removeBlackout(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ) {
    return this.architectService.removeBlackout(id, admin.siteCode);
  }
}
