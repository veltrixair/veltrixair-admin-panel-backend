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
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FEATURE, PERMISSION } from '../auth/permissions.constants';
import type { AuthenticatedAdmin } from '../auth/permissions.constants';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ContactService } from './contact.service';
import {
  AddEnquiryNoteDto,
  AssignEnquiryDto,
  UpdateEnquiryStatusDto,
} from './dto/update-enquiry-status.dto';
import { ListEnquiriesDto } from './dto/list-enquiries.dto';
import { ContactEnquiryEvent } from './entities/contact-enquiry-event.entity';
import { ContactEnquiry } from './entities/contact-enquiry.entity';

/**
 * Lead PII lives behind these routes, so both guards apply at class level —
 * a route added later is protected by default rather than by remembering to.
 *
 * The actor threaded through every mutating call is now the signed-in admin's
 * email, which is what the audit trail was always shaped for.
 */
@ApiTags('Contact (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard)
@Controller('admin/contact')
export class AdminContactController {
  constructor(private readonly contactService: ContactService) {}

  @Get('enquiries')
  @Permissions(FEATURE.IT_CONTACT, PERMISSION.VIEW)
  @ApiOperation({ summary: 'List enquiries (excludes message body and phone)' })
  @ResponseMessage('Enquiries retrieved')
  list(
    @Query() query: ListEnquiriesDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PaginatedResult<ContactEnquiry>> {
    return this.contactService.list(query, admin.siteCode);
  }

  @Get('enquiries/:id')
  @Permissions(FEATURE.IT_CONTACT, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'Read one enquiry in full — logs access when NDA-flagged',
  })
  @ResponseMessage('Enquiry retrieved')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<ContactEnquiry> {
    return this.contactService.findOne(id, admin.email, admin.siteCode);
  }

  @Get('enquiries/:id/events')
  @Permissions(FEATURE.IT_CONTACT, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Timeline for an enquiry' })
  @ResponseMessage('Events retrieved')
  listEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<ContactEnquiryEvent[]> {
    return this.contactService.listEvents(id, admin.siteCode);
  }

  @Patch('enquiries/:id/status')
  @Permissions(FEATURE.IT_CONTACT, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Change status; first move off NEW stops the SLA' })
  @ResponseMessage('Status updated')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEnquiryStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<ContactEnquiry> {
    return this.contactService.updateStatus(
      id,
      dto.status,
      dto.note,
      admin.email,
      admin.siteCode,
    );
  }

  @Patch('enquiries/:id/assign')
  @Permissions(FEATURE.IT_CONTACT, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Assign an enquiry to a practitioner' })
  @ResponseMessage('Enquiry assigned')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignEnquiryDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<ContactEnquiry> {
    return this.contactService.assign(
      id,
      dto.assignedTo,
      admin.email,
      admin.siteCode,
    );
  }

  @Post('enquiries/:id/notes')
  @Permissions(FEATURE.IT_CONTACT, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Append an internal note' })
  @ResponseMessage('Note added')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddEnquiryNoteDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<ContactEnquiryEvent> {
    return this.contactService.addNote(
      id,
      dto.note,
      admin.email,
      admin.siteCode,
    );
  }
}
