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
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { SiteScope } from '../../auth/decorators/site-scope.decorator';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { SiteScopeGuard } from '../../auth/guards/site-scope.guard';
import { FEATURE, PERMISSION, SITE } from '../../auth/permissions.constants';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { PaginatedResult } from '../../common/dto/pagination-query.dto';
import { CraneCareerService } from './crane-career.service';
import type { CraneJobPostingWithApplicants } from './crane-career.service';
import {
  ListCraneJobsDto,
  UpdateCraneJobStatusDto,
  UpsertCraneJobDto,
} from './dto/upsert-crane-job.dto';
import { CraneJobPosting } from './entities/crane-job-posting.entity';

/**
 * The crane job board, admin side.
 *
 * Feature 111 governs the adverts only. Candidates sit behind 112, so someone
 * can publish a vacancy without being handed a list of applicants' nationality
 * and residency status.
 */
@ApiTags('Crane careers (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard, SiteScopeGuard)
@SiteScope(SITE.INDUSTRIES)
@Controller('admin/crane-careers')
export class AdminCraneCareerController {
  constructor(private readonly careers: CraneCareerService) {}

  @Get('jobs')
  @Permissions(FEATURE.CRANE_CAREERS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'List roles including drafts and closed' })
  @ResponseMessage('Roles retrieved')
  list(
    @Query() query: ListCraneJobsDto,
  ): Promise<PaginatedResult<CraneJobPostingWithApplicants>> {
    return this.careers.listForAdmin(query);
  }

  @Get('jobs/:id')
  @Permissions(FEATURE.CRANE_CAREERS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'One role by id' })
  @ResponseMessage('Role retrieved')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CraneJobPosting> {
    return this.careers.findById(id);
  }

  @Post('jobs')
  @Permissions(FEATURE.CRANE_CAREERS, PERMISSION.CREATE)
  @ApiOperation({ summary: 'Create a role' })
  @ResponseMessage('Role created')
  create(@Body() dto: UpsertCraneJobDto): Promise<CraneJobPosting> {
    return this.careers.create(dto);
  }

  @Patch('jobs/:id')
  @Permissions(FEATURE.CRANE_CAREERS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Update a role' })
  @ResponseMessage('Role updated')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCraneJobDto,
  ): Promise<CraneJobPosting> {
    return this.careers.update(id, dto);
  }

  @Patch('jobs/:id/status')
  @Permissions(FEATURE.CRANE_CAREERS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Publish or close a role' })
  @ResponseMessage('Status updated')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCraneJobStatusDto,
  ): Promise<CraneJobPosting> {
    return this.careers.setStatus(id, dto.status);
  }

  @Delete('jobs/:id')
  @Permissions(FEATURE.CRANE_CAREERS, PERMISSION.DELETE)
  @ApiOperation({ summary: 'Soft-delete a role' })
  @ResponseMessage('Role removed')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.careers.remove(id);
  }
}
