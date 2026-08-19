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
import {
  GenerateSlotsDto,
  ListBookingsDto,
  UpdateBookingStatusDto,
} from './dto/list-bookings.dto';
import {
  AssignPracticesDto,
  CreateArchitectDto,
  CreateBlackoutDto,
  ReplaceAvailabilityDto,
  UpdateArchitectDto,
} from './dto/upsert-architect.dto';
import { ArchitectAvailabilityRule } from './entities/architect-availability-rule.entity';
import { ArchitectBlackout } from './entities/architect-blackout.entity';
import { Architect } from './entities/architect.entity';
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

  @Patch('bookings/:id/status')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Update status — cancelling releases the slot back to FREE',
  })
  @ResponseMessage('Status updated')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<DiscoveryBooking> {
    return this.bookingService.setStatus(id, dto.status, admin.siteCode);
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
   * Replace the practices an architect covers. Slots belong to the architect,
   * so their whole calendar follows the assignment — no regeneration needed.
   */
  @Put('architects/:id/practices')
  @Permissions(FEATURE.IT_DISCOVERY, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Assign the practices an architect covers (one or more)',
  })
  @ResponseMessage('Practices assigned')
  assignPractices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPracticesDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ) {
    return this.architectService.assignPractices(id, dto, admin.siteCode);
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
