import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import type { UploadedFile as StoredUpload } from '../../files/files.service';
import { CraneApplicationService } from './crane-application.service';
import {
  AddCraneApplicationNoteDto,
  AssignCraneApplicationDto,
  ListCraneApplicationsDto,
  UpdateCraneApplicationStatusDto,
} from './dto/manage-crane-application.dto';
import { CraneApplicationEvent } from './entities/crane-application-event.entity';
import { CraneApplication } from './entities/crane-application.entity';

/** 5 MB, same ceiling the IT résumé route uses. */
const MAX_CV_BYTES = 5 * 1024 * 1024;

/**
 * The crane candidate pipeline.
 *
 * Feature 112, separate from the adverts, because these records carry
 * nationality and KSA residency status.
 */
@ApiTags('Crane applications (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard, SiteScopeGuard)
@SiteScope(SITE.INDUSTRIES)
@Controller('admin/crane-applications')
export class AdminCraneApplicationController {
  constructor(private readonly applications: CraneApplicationService) {}

  @Get()
  @Permissions(FEATURE.CRANE_APPLICATIONS, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'List candidates — no nationality, mobile or background',
  })
  @ResponseMessage('Applications retrieved')
  list(
    @Query() query: ListCraneApplicationsDto,
  ): Promise<PaginatedResult<CraneApplication>> {
    return this.applications.list(query);
  }

  @Get(':id')
  @Permissions(FEATURE.CRANE_APPLICATIONS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'One candidate in full' })
  @ResponseMessage('Application retrieved')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CraneApplication> {
    return this.applications.findById(id);
  }

  @Get(':id/events')
  @Permissions(FEATURE.CRANE_APPLICATIONS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Timeline for an application' })
  @ResponseMessage('Events retrieved')
  events(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CraneApplicationEvent[]> {
    return this.applications.listEvents(id);
  }

  /**
   * A time-limited link to the CV. Gated on CRANE_APPLICATIONS, not FILES,
   * and the access is written to the application's timeline.
   */
  @Get(':id/cv-url')
  @Permissions(FEATURE.CRANE_APPLICATIONS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Signed link to the CV; the access is recorded' })
  @ResponseMessage('Download link issued')
  cvUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    return this.applications.cvUrl(id, admin.email);
  }

  /** The same, for one of the tickets or cards attached to the application. */
  @Get(':id/certificates/:fileId/url')
  @Permissions(FEATURE.CRANE_APPLICATIONS, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'Signed link to a certificate; the access is recorded',
  })
  @ResponseMessage('Download link issued')
  certificateUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    return this.applications.certificateUrl(id, fileId, admin.email);
  }

  @Patch(':id/status')
  @Permissions(FEATURE.CRANE_APPLICATIONS, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Move a stage; the clock resets to that stage’s promise',
  })
  @ResponseMessage('Stage updated')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCraneApplicationStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneApplication> {
    return this.applications.setStatus(id, dto.status, dto.note, admin.email);
  }

  /**
   * Replace the CV on an application.
   *
   * The form carries one now, so this is not how a CV first arrives — it is for
   * a corrupt file or a better version the candidate sends on. The previous
   * file stays in storage: the retention purge owns deletion, and a recruiter
   * who replaced the wrong record should be able to ask for it back.
   */
  @Post(':id/cv')
  @Permissions(FEATURE.CRANE_APPLICATIONS, PERMISSION.UPDATE)
  @UseInterceptors(
    FileInterceptor('cv', { limits: { fileSize: MAX_CV_BYTES } }),
  )
  @ApiOperation({ summary: 'Replace the CV on an application' })
  @ResponseMessage('CV replaced')
  replaceCv(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() cv: StoredUpload | undefined,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneApplication> {
    if (!cv) {
      throw new BadRequestException(
        'Attach the replacement CV in the "cv" field (PDF, DOC or DOCX).',
      );
    }
    return this.applications.replaceCv(id, cv, admin.email);
  }

  @Patch(':id/assign')
  @Permissions(FEATURE.CRANE_APPLICATIONS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Assign to a recruiter, or unassign' })
  @ResponseMessage('Application assigned')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCraneApplicationDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneApplication> {
    return this.applications.assign(id, dto.assignedTo, admin.email);
  }

  @Post(':id/notes')
  @Permissions(FEATURE.CRANE_APPLICATIONS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Append an internal note' })
  @ResponseMessage('Note added')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCraneApplicationNoteDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneApplicationEvent> {
    return this.applications.addNote(id, dto.note, admin.email);
  }
}
