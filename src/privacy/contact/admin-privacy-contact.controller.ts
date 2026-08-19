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
import {
  AddPrivacyContactNoteDto,
  AssignPrivacyContactDto,
  ListPrivacyContactDto,
  UpdatePrivacyContactStatusDto,
} from './dto/manage-privacy-contact.dto';
import { PrivacyContactEvent } from './entities/privacy-contact-event.entity';
import { PrivacyContactEnquiry } from './entities/privacy-contact-enquiry.entity';
import { PrivacyContactService } from './privacy-contact.service';

/**
 * The privacy practice's enquiry pipeline.
 *
 * Its own feature code (110) rather than sharing the IT contact feature, so a
 * badge on one brand grants nothing on the other. SALES is deliberately not
 * among the holders — these go to a practitioner, not a sales pipeline.
 */
@ApiTags('Privacy contact (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard, SiteScopeGuard)
@SiteScope(SITE.PRIVACY)
@Controller('admin/privacy-enquiries')
export class AdminPrivacyContactController {
  constructor(private readonly enquiries: PrivacyContactService) {}

  @Get()
  @Permissions(FEATURE.PRIVACY_ENQUIRIES, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'List enquiries, newest first — no brief or phone',
  })
  @ResponseMessage('Privacy enquiries retrieved')
  list(
    @Query() query: ListPrivacyContactDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PaginatedResult<PrivacyContactEnquiry>> {
    return this.enquiries.list(query, admin.siteCode);
  }

  @Get(':id')
  @Permissions(FEATURE.PRIVACY_ENQUIRIES, PERMISSION.VIEW)
  @ApiOperation({ summary: 'One enquiry in full, including the brief' })
  @ResponseMessage('Privacy enquiry retrieved')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PrivacyContactEnquiry> {
    return this.enquiries.findById(id, admin.siteCode);
  }

  @Get(':id/events')
  @Permissions(FEATURE.PRIVACY_ENQUIRIES, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Timeline for an enquiry' })
  @ResponseMessage('Events retrieved')
  events(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PrivacyContactEvent[]> {
    return this.enquiries.listEvents(id, admin.siteCode);
  }

  @Patch(':id/status')
  @Permissions(FEATURE.PRIVACY_ENQUIRIES, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Change status; the first move off NEW stops the SLA clock',
  })
  @ResponseMessage('Status updated')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrivacyContactStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PrivacyContactEnquiry> {
    return this.enquiries.setStatus(
      id,
      dto.status,
      dto.note,
      admin.email,
      admin.siteCode,
    );
  }

  /** Send `assignedTo: null` to hand it back to the unassigned queue. */
  @Patch(':id/assign')
  @Permissions(FEATURE.PRIVACY_ENQUIRIES, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Assign to a practitioner, or unassign' })
  @ResponseMessage('Privacy enquiry assigned')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPrivacyContactDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PrivacyContactEnquiry> {
    return this.enquiries.assign(
      id,
      dto.assignedTo,
      admin.email,
      admin.siteCode,
    );
  }

  @Post(':id/notes')
  @Permissions(FEATURE.PRIVACY_ENQUIRIES, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Append an internal note' })
  @ResponseMessage('Note added')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPrivacyContactNoteDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PrivacyContactEvent> {
    return this.enquiries.addNote(id, dto.note, admin.email, admin.siteCode);
  }
}
