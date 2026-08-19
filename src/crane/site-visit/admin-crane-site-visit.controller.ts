import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { CraneSiteVisitService } from './crane-site-visit.service';
import {
  AddCraneSiteVisitNoteDto,
  AssignCraneSiteVisitDto,
  ListCraneSiteVisitsDto,
  ScheduleCraneSiteVisitDto,
  UpdateCraneSiteVisitStatusDto,
} from './dto/manage-crane-site-visit.dto';
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
  constructor(private readonly visits: CraneSiteVisitService) {}

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
      dto.assignedEngineer,
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
    return this.visits.assign(id, dto.assignedEngineer, admin.email);
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
