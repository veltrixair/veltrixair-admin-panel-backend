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
import { ListDemoRequestsDto } from './dto/list-demo-requests.dto';
import {
  AddDemoRequestNoteDto,
  AssignDemoRequestDto,
  MarkNotifiedDto,
  SetNotifiedDto,
  UpdateDemoRequestStatusDto,
} from './dto/update-demo-request.dto';
import { KnodeDemoRequestEvent } from './entities/knode-demo-request-event.entity';
import { KnodeDemoRequest } from './entities/knode-demo-request.entity';
import {
  KnodeDemoService,
  KnodeDemoStats,
  MarkNotifiedResult,
} from './knode-demo.service';

/**
 * kNODE is an IT-unit product, so the scope is hard rather than a filter — a
 * crane administrator is refused outright rather than shown an empty list.
 *
 * Its own feature code rather than riding on IT_CONTACT: a contact enquiry is
 * somebody asking to be sold to, while this is a hospital's bed count, its
 * daily footfall and the mobile number of the person who runs it.
 */
@ApiTags('kNODE demo (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard, SiteScopeGuard)
@SiteScope(SITE.IT)
@Controller('admin/knode')
export class AdminKnodeDemoController {
  constructor(private readonly demoService: KnodeDemoService) {}

  @Get('demo-requests')
  @Permissions(FEATURE.KNODE_DEMO, PERMISSION.VIEW)
  @ApiOperation({
    summary:
      'List requests — `intent=DEMO` is the demo pipeline, `intent=NOTIFY` the notify list',
  })
  @ResponseMessage('Requests retrieved')
  list(
    @Query() query: ListDemoRequestsDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PaginatedResult<KnodeDemoRequest>> {
    return this.demoService.list(query, admin.siteCode);
  }

  @Get('demo-requests/stats')
  @Permissions(FEATURE.KNODE_DEMO, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Counts for the kNODE dashboard tiles' })
  @ResponseMessage('Stats retrieved')
  stats(@CurrentUser() admin: AuthenticatedAdmin): Promise<KnodeDemoStats> {
    return this.demoService.stats(admin.siteCode);
  }

  /**
   * How many are waiting, per module. This is the waiting list's own view —
   * you work it by release, not by row.
   */
  @Get('demo-requests/waiting-by-module')
  @Permissions(FEATURE.KNODE_DEMO, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Waiting-list size per module' })
  @ResponseMessage('Waiting list retrieved')
  waitingByModule(
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ moduleCode: number; moduleName: string; waiting: number }[]> {
    return this.demoService.waitingByModule(admin.siteCode);
  }

  @Get('demo-requests/:id')
  @Permissions(FEATURE.KNODE_DEMO, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'One request in full — phone, notes and the modules asked about',
  })
  @ResponseMessage('Request retrieved')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<KnodeDemoRequest> {
    return this.demoService.findOne(id, admin.siteCode);
  }

  @Get('demo-requests/:id/events')
  @Permissions(FEATURE.KNODE_DEMO, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Timeline for a request' })
  @ResponseMessage('Events retrieved')
  listEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<KnodeDemoRequestEvent[]> {
    return this.demoService.listEvents(id, admin.siteCode);
  }

  @Patch('demo-requests/:id/status')
  @Permissions(FEATURE.KNODE_DEMO, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Move a demo along its ladder — refused on a notify request',
  })
  @ResponseMessage('Status updated')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDemoRequestStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<KnodeDemoRequest> {
    return this.demoService.updateStatus(
      id,
      dto.status,
      dto.note,
      admin.email,
      admin.siteCode,
    );
  }

  /**
   * The waiting list's only action, and deliberately bulk.
   *
   * A release happens once; the queue it collected is cleared in one call
   * rather than walked row by row, which is both tedious and a way to miss
   * somebody.
   */
  @Post('demo-requests/mark-notified')
  @Permissions(FEATURE.KNODE_DEMO, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Tell everyone waiting for a module that it has shipped',
  })
  @ResponseMessage('Waiting list notified')
  markNotified(
    @Body() dto: MarkNotifiedDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<MarkNotifiedResult> {
    return this.demoService.markNotified(dto, admin.email, admin.siteCode);
  }

  /**
   * The single-row correction beside the bulk route above.
   *
   * Both directions, because a stamp applied by mistake — or an address that
   * bounced — has to be undoable. The bulk route only ever moves rows one way,
   * which is right for a release and wrong for a correction.
   */
  @Patch('demo-requests/:id/notified')
  @Permissions(FEATURE.KNODE_DEMO, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Mark one request notified, or put it back — refused on a demo',
  })
  @ResponseMessage('Notified state updated')
  setNotified(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetNotifiedDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<KnodeDemoRequest> {
    return this.demoService.setNotified(
      id,
      dto.notified,
      dto.note,
      admin.email,
      admin.siteCode,
    );
  }

  @Patch('demo-requests/:id/assign')
  @Permissions(FEATURE.KNODE_DEMO, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Assign a request, or unassign it' })
  @ResponseMessage('Request assigned')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDemoRequestDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<KnodeDemoRequest> {
    return this.demoService.assign(
      id,
      dto.assignedTo,
      admin.email,
      admin.siteCode,
    );
  }

  @Post('demo-requests/:id/notes')
  @Permissions(FEATURE.KNODE_DEMO, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Append an internal note' })
  @ResponseMessage('Note added')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDemoRequestNoteDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<KnodeDemoRequestEvent> {
    return this.demoService.addNote(id, dto.note, admin.email, admin.siteCode);
  }
}
