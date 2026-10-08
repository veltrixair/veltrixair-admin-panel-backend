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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { SiteScope } from '../../auth/decorators/site-scope.decorator';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { SiteScopeGuard } from '../../auth/guards/site-scope.guard';
import { FEATURE, PERMISSION, SITE } from '../../auth/permissions.constants';
import type { AuthenticatedAdmin } from '../../auth/permissions.constants';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { PaginatedResult } from '../../common/dto/pagination-query.dto';
import { CraneEngineerService } from './crane-engineer.service';
import type { EngineerOption } from './crane-engineer.service';
import { CraneSiteVisitService } from './crane-site-visit.service';
import {
  AddCraneSiteVisitNoteDto,
  AssignCraneSiteVisitDto,
  ListCraneSiteVisitsDto,
  ScheduleCraneSiteVisitDto,
  UpdateCraneSiteVisitStatusDto,
} from './dto/manage-crane-site-visit.dto';
import {
  AssignServiceLinesDto,
  CreateCraneEngineerDto,
  UpdateCraneEngineerDto,
} from './dto/upsert-crane-engineer.dto';
import { CraneEngineer } from './entities/crane-engineer.entity';
import { CraneServiceLineMaster } from '../masters/entities/crane-service-line-master.entity';
import { CraneSiteVisitEvent } from './entities/crane-site-visit-event.entity';
import { CraneSiteVisit } from './entities/crane-site-visit.entity';

/**
 * The site visit pipeline.
 *
 * Its own feature code (109) rather than sharing the quote pipeline's, because
 * the page describes visits as engineer-led and quotes as sales-led. Both are
 * held by the same roles today; separating them later now costs nothing.
 */
@ApiTags('Crane site visits (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard, SiteScopeGuard)
@SiteScope(SITE.INDUSTRIES)
@Controller('admin/crane-site-visits')
export class AdminCraneSiteVisitController {
  constructor(
    private readonly visits: CraneSiteVisitService,
    private readonly engineers: CraneEngineerService,
  ) {}

  // -----------------------------------------------------------------------
  // The engineer roster
  // -----------------------------------------------------------------------

  /*
   * On this controller rather than one of its own.
   *
   * The roster exists for the visit pipeline and is administered by the same
   * coordinators under the same feature code. A second controller would mean a
   * second permission surface for one list of people.
   *
   * These sit ABOVE the `:id` visit routes on purpose: `/engineers` would
   * otherwise be read as a visit id and answer 400 before reaching here.
   */

  @Get('engineers')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'List engineers on the roster' })
  @ResponseMessage('Engineers retrieved')
  listEngineers(
    @CurrentUser() admin: AuthenticatedAdmin,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<CraneEngineer[]> {
    return this.engineers.list(includeInactive === 'true', admin.siteCode);
  }

  /** The service-line dropdown for the engineer form. */
  @Get('engineers/service-lines')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Service line options for the engineer form' })
  @ResponseMessage('Service lines retrieved')
  engineerServiceLines(): Promise<CraneServiceLineMaster[]> {
    return this.engineers.listServiceLines();
  }

  /**
   * Who a visit can be given to — one line per service line, so somebody
   * covering two appears under each.
   */
  @Get('engineers/assignment-options')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Engineers a visit can be assigned to' })
  @ResponseMessage('Options retrieved')
  engineerOptions(
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<EngineerOption[]> {
    return this.engineers.assignmentOptions(admin.siteCode);
  }

  @Get('engineers/:engineerId')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Get one engineer' })
  @ResponseMessage('Engineer retrieved')
  getEngineer(
    @Param('engineerId', ParseUUIDPipe) engineerId: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneEngineer> {
    return this.engineers.findById(engineerId, admin.siteCode);
  }

  @Post('engineers')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.CREATE)
  @ApiOperation({ summary: 'Add an engineer to the roster' })
  @ResponseMessage('Engineer added')
  createEngineer(
    @Body() dto: CreateCraneEngineerDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneEngineer> {
    return this.engineers.create(dto, admin.siteCode);
  }

  @Patch('engineers/:engineerId')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Update an engineer' })
  @ResponseMessage('Engineer updated')
  updateEngineer(
    @Param('engineerId', ParseUUIDPipe) engineerId: string,
    @Body() dto: UpdateCraneEngineerDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneEngineer> {
    return this.engineers.update(engineerId, dto, admin.siteCode);
  }

  @Put('engineers/:engineerId/service-lines')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Replace the services an engineer covers' })
  @ResponseMessage('Service lines assigned')
  assignServiceLines(
    @Param('engineerId', ParseUUIDPipe) engineerId: string,
    @Body() dto: AssignServiceLinesDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ) {
    return this.engineers.assignServiceLines(engineerId, dto, admin.siteCode);
  }

  /** Refused while visits are still ahead of them — never a hard delete. */
  @Delete('engineers/:engineerId')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.DELETE)
  @ApiOperation({
    summary: 'Take an engineer off the roster — refuses on upcoming visits',
  })
  @ResponseMessage('Engineer removed from the roster')
  deactivateEngineer(
    @Param('engineerId', ParseUUIDPipe) engineerId: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ message: string }> {
    return this.engineers.deactivate(engineerId, admin.siteCode);
  }

  // -----------------------------------------------------------------------
  // Visits
  // -----------------------------------------------------------------------

  @Get()
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'List visit requests, soonest wanted first — no site addresses',
  })
  @ResponseMessage('Site visit requests retrieved')
  list(
    @Query() query: ListCraneSiteVisitsDto,
  ): Promise<PaginatedResult<CraneSiteVisit>> {
    return this.visits.list(query);
  }

  @Get(':id')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'One visit request in full' })
  @ResponseMessage('Site visit request retrieved')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CraneSiteVisit> {
    return this.visits.findById(id);
  }

  @Get(':id/events')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Timeline for a visit request' })
  @ResponseMessage('Events retrieved')
  events(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CraneSiteVisitEvent[]> {
    return this.visits.listEvents(id);
  }

  @Patch(':id/status')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.UPDATE)
  @ApiOperation({
    summary:
      'Move through the pipeline; the first move stops the 48-hour clock',
  })
  @ResponseMessage('Status updated')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCraneSiteVisitStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneSiteVisit> {
    return this.visits.setStatus(id, dto.status, dto.note, admin.email);
  }

  /** Confirming a date also moves the request to SCHEDULED. */
  @Patch(':id/schedule')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Confirm the visit date and engineer' })
  @ResponseMessage('Site visit scheduled')
  schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleCraneSiteVisitDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneSiteVisit> {
    return this.visits.schedule(
      id,
      dto.scheduledAt,
      dto.engineerId,
      dto.note,
      admin.email,
    );
  }

  @Patch(':id/assign')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Assign an engineer' })
  @ResponseMessage('Site visit assigned')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCraneSiteVisitDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneSiteVisit> {
    return this.visits.assign(id, dto.engineerId, admin.email);
  }

  @Post(':id/notes')
  @Permissions(FEATURE.CRANE_SITE_VISITS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Append an internal note' })
  @ResponseMessage('Note added')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCraneSiteVisitNoteDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneSiteVisitEvent> {
    return this.visits.addNote(id, dto.note, admin.email);
  }
}
