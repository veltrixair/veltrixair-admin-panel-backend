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
import { ListKnodeLeadsDto } from './dto/list-knode-leads.dto';
import {
  AddKnodeLeadNoteDto,
  AssignKnodeLeadDto,
  UpdateKnodeLeadStatusDto,
} from './dto/update-knode-lead-status.dto';
import { KnodeLeadEvent } from './entities/knode-lead-event.entity';
import { KnodeLead } from './entities/knode-lead.entity';
import { KnodeService, KnodeStats } from './knode.service';

/**
 * Knode is an IT-unit product, so the scope is hard rather than a filter — a
 * crane administrator is refused outright rather than shown an empty list.
 *
 * This is commercial pipeline data: what a hospital agreed to, and the mobile
 * number of the person who agreed it. Hence its own feature code rather than
 * riding on IT_CONTACT.
 */
@ApiTags('Knode (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard, SiteScopeGuard)
@SiteScope(SITE.IT)
@Controller('admin/knode')
export class AdminKnodeController {
  constructor(private readonly knodeService: KnodeService) {}

  @Get('leads')
  @Permissions(FEATURE.KNODE, PERMISSION.VIEW)
  @ApiOperation({
    summary:
      'List leads — `type` picks a sub-section; excludes WhatsApp and notes',
  })
  @ResponseMessage('Leads retrieved')
  list(
    @Query() query: ListKnodeLeadsDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PaginatedResult<KnodeLead>> {
    return this.knodeService.list(query, admin.siteCode);
  }

  /** The four tiles, counted in the database rather than off one page of rows. */
  @Get('leads/stats')
  @Permissions(FEATURE.KNODE, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Counts for the Knode dashboard tiles' })
  @ResponseMessage('Stats retrieved')
  stats(@CurrentUser() admin: AuthenticatedAdmin): Promise<KnodeStats> {
    return this.knodeService.stats(admin.siteCode);
  }

  @Get('leads/:id')
  @Permissions(FEATURE.KNODE, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'One lead in full, including the WhatsApp number and notes',
  })
  @ResponseMessage('Lead retrieved')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<KnodeLead> {
    return this.knodeService.findOne(id, admin.siteCode);
  }

  @Get('leads/:id/events')
  @Permissions(FEATURE.KNODE, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Timeline for a lead' })
  @ResponseMessage('Events retrieved')
  listEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<KnodeLeadEvent[]> {
    return this.knodeService.listEvents(id, admin.siteCode);
  }

  @Patch('leads/:id/status')
  @Permissions(FEATURE.KNODE, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Change status — validated against this lead’s own ladder',
  })
  @ResponseMessage('Status updated')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnodeLeadStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<KnodeLead> {
    return this.knodeService.updateStatus(
      id,
      dto.status,
      dto.note,
      admin.email,
      admin.siteCode,
    );
  }

  @Patch('leads/:id/assign')
  @Permissions(FEATURE.KNODE, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Assign a lead, or unassign it' })
  @ResponseMessage('Lead assigned')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignKnodeLeadDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<KnodeLead> {
    return this.knodeService.assign(
      id,
      dto.assignedTo,
      admin.email,
      admin.siteCode,
    );
  }

  @Post('leads/:id/notes')
  @Permissions(FEATURE.KNODE, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Append an internal note' })
  @ResponseMessage('Note added')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddKnodeLeadNoteDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<KnodeLeadEvent> {
    return this.knodeService.addNote(id, dto.note, admin.email, admin.siteCode);
  }
}
