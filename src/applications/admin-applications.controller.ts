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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { SiteScope } from '../auth/decorators/site-scope.decorator';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SiteScopeGuard } from '../auth/guards/site-scope.guard';
import { FEATURE, PERMISSION, SITE } from '../auth/permissions.constants';
import type { AuthenticatedAdmin } from '../auth/permissions.constants';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ApplicationService } from './application.service';
import { ListApplicationsDto } from './dto/list-applications.dto';
import {
  AddApplicationNoteDto,
  AssignApplicationDto,
  UpdateApplicationStatusDto,
} from './dto/update-application-status.dto';
import { JobApplicationEvent } from './entities/job-application-event.entity';
import { JobApplication } from './entities/job-application.entity';

/**
 * The hiring pipeline.
 *
 * Guarded by APPLICATIONS (107), not CAREERS. CONTENT_EDITOR and VIEWER hold
 * CAREERS:VIEW so they can work with job adverts — sharing a feature code would
 * have handed both of them every candidate's phone number, salary expectation
 * and CV. Only RECRUITER and SUPER_ADMIN reach these routes.
 */
@ApiTags('Applications (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard, SiteScopeGuard)
// Crane runs its own careers module, so this board is IT’s alone. Without
// the scope a crane admin gets an empty list here rather than being told
// their postings live somewhere else.
@SiteScope(SITE.IT)
@Controller('admin/applications')
export class AdminApplicationsController {
  constructor(private readonly applications: ApplicationService) {}

  @Get()
  @Permissions(FEATURE.IT_APPLICATIONS, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'List applications — excludes phone, salary and cover note',
  })
  @ResponseMessage('Applications retrieved')
  list(
    @Query() query: ListApplicationsDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PaginatedResult<JobApplication>> {
    return this.applications.list(query, admin.siteCode);
  }

  @Get(':id')
  @Permissions(FEATURE.IT_APPLICATIONS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'One application in full' })
  @ResponseMessage('Application retrieved')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<JobApplication> {
    return this.applications.findById(id, admin.siteCode);
  }

  /** Issuing a link is recorded — a CV is the most sensitive thing here. */
  @Get(':id/resume')
  @Permissions(FEATURE.IT_APPLICATIONS, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'Short-lived signed URL for the résumé; logs access',
  })
  @ResponseMessage('Download link issued')
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    return this.applications.resumeUrl(id, admin.email, admin.siteCode);
  }

  @Get(':id/events')
  @Permissions(FEATURE.IT_APPLICATIONS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Timeline for an application' })
  @ResponseMessage('Events retrieved')
  events(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<JobApplicationEvent[]> {
    return this.applications.listEvents(id, admin.siteCode);
  }

  @Patch(':id/status')
  @Permissions(FEATURE.IT_APPLICATIONS, PERMISSION.UPDATE)
  @ApiOperation({
    summary: "Move through the pipeline — WITHDRAWN is the candidate's alone",
  })
  @ResponseMessage('Status updated')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<JobApplication> {
    return this.applications.setStatus(
      id,
      dto.status,
      dto.note,
      admin.email,
      admin.siteCode,
    );
  }

  @Patch(':id/assign')
  @Permissions(FEATURE.IT_APPLICATIONS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Assign to a recruiter' })
  @ResponseMessage('Application assigned')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignApplicationDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<JobApplication> {
    return this.applications.assign(
      id,
      dto.assignedTo,
      admin.email,
      admin.siteCode,
    );
  }

  @Post(':id/notes')
  @Permissions(FEATURE.IT_APPLICATIONS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Append an internal note' })
  @ResponseMessage('Note added')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddApplicationNoteDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<JobApplicationEvent> {
    return this.applications.addNote(id, dto.note, admin.email, admin.siteCode);
  }
}
