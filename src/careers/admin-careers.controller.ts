import {
  Body,
  Controller,
  Delete,
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
import { CareersService } from './careers.service';
import type { JobPostingWithApplicants } from './careers.service';
import { ListJobsAdminDto } from './dto/list-jobs.dto';
import {
  CreateJobDto,
  UpdateJobDto,
  UpdateJobStatusDto,
} from './dto/upsert-job.dto';
import { JobPosting } from './entities/job-posting.entity';

/**
 * Recruiters own this surface end to end; content editors may reword a posting
 * but not create or remove one.
 */
@ApiTags('Careers (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard, SiteScopeGuard)
// Crane runs its own careers module, so this board is IT’s alone. Without
// the scope a crane admin gets an empty list here rather than being told
// their postings live somewhere else.
@SiteScope(SITE.IT)
@Controller('admin/careers')
export class AdminCareersController {
  constructor(private readonly careersService: CareersService) {}

  @Get('jobs')
  @Permissions(FEATURE.IT_CAREERS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'List all roles including drafts and closed' })
  @ResponseMessage('Jobs retrieved')
  list(
    @Query() query: ListJobsAdminDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PaginatedResult<JobPostingWithApplicants>> {
    return this.careersService.listForAdmin(query, admin.siteCode);
  }

  @Get('jobs/:id')
  @Permissions(FEATURE.IT_CAREERS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Get one role by id' })
  @ResponseMessage('Job retrieved')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<JobPosting> {
    return this.careersService.findById(id, admin.siteCode);
  }

  @Post('jobs')
  @Permissions(FEATURE.IT_CAREERS, PERMISSION.CREATE)
  @ApiOperation({ summary: 'Create a role' })
  @ResponseMessage('Job created')
  create(
    @Body() dto: CreateJobDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<JobPosting> {
    return this.careersService.create(dto, admin.siteCode);
  }

  @Patch('jobs/:id')
  @Permissions(FEATURE.IT_CAREERS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Update a role' })
  @ResponseMessage('Job updated')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<JobPosting> {
    return this.careersService.update(id, dto, admin.siteCode);
  }

  @Patch('jobs/:id/status')
  @Permissions(FEATURE.IT_CAREERS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Publish or close a role' })
  @ResponseMessage('Status updated')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<JobPosting> {
    return this.careersService.setStatus(id, dto.status, admin.siteCode);
  }

  @Delete('jobs/:id')
  @Permissions(FEATURE.IT_CAREERS, PERMISSION.DELETE)
  @ApiOperation({ summary: 'Soft-delete a role' })
  @ResponseMessage('Job removed')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ message: string }> {
    return this.careersService.remove(id, admin.siteCode);
  }
}
