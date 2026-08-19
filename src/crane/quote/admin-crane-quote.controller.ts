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
import { CraneQuoteService } from './crane-quote.service';
import { ListCraneQuotesDto } from './dto/list-crane-quotes.dto';
import {
  AddCraneQuoteNoteDto,
  AssignCraneQuoteDto,
  UpdateCraneQuoteStatusDto,
} from './dto/update-crane-quote-status.dto';
import { CraneQuoteEvent } from './entities/crane-quote-event.entity';
import { CraneQuoteRequest } from './entities/crane-quote-request.entity';

/**
 * The crane quote pipeline.
 *
 * Guarded by CRANE_QUOTES (108), held by SALES and SUPER_ADMIN, with VIEWER
 * able to read. The role means the same on every brand — what stops an IT
 * salesperson reaching these is that their session is scoped to site 101 and
 * every query here is bound to 102.
 */
@ApiTags('Crane quotes (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard, SiteScopeGuard)
@SiteScope(SITE.INDUSTRIES)
@Controller('admin/crane-quotes')
export class AdminCraneQuoteController {
  constructor(private readonly quotes: CraneQuoteService) {}

  @Get()
  @Permissions(FEATURE.CRANE_QUOTES, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'List quote requests, worst priority first — no commercial detail',
  })
  @ResponseMessage('Quote requests retrieved')
  list(
    @Query() query: ListCraneQuotesDto,
  ): Promise<PaginatedResult<CraneQuoteRequest>> {
    return this.quotes.list(query);
  }

  @Get(':id')
  @Permissions(FEATURE.CRANE_QUOTES, PERMISSION.VIEW)
  @ApiOperation({ summary: 'One quote request in full' })
  @ResponseMessage('Quote request retrieved')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CraneQuoteRequest> {
    return this.quotes.findById(id);
  }

  @Get(':id/attachments/:fileId')
  @Permissions(FEATURE.CRANE_QUOTES, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Signed URL for one attachment; logs the access' })
  @ResponseMessage('Download link issued')
  attachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    return this.quotes.attachmentUrl(id, fileId, admin.email);
  }

  @Get(':id/events')
  @Permissions(FEATURE.CRANE_QUOTES, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Timeline for a quote request' })
  @ResponseMessage('Events retrieved')
  events(@Param('id', ParseUUIDPipe) id: string): Promise<CraneQuoteEvent[]> {
    return this.quotes.listEvents(id);
  }

  @Patch(':id/status')
  @Permissions(FEATURE.CRANE_QUOTES, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Move through the pipeline; the first move stops the triage clock',
  })
  @ResponseMessage('Status updated')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCraneQuoteStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneQuoteRequest> {
    return this.quotes.setStatus(id, dto.status, dto.note, admin.email);
  }

  @Patch(':id/assign')
  @Permissions(FEATURE.CRANE_QUOTES, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Assign to an engineer' })
  @ResponseMessage('Quote request assigned')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCraneQuoteDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneQuoteRequest> {
    return this.quotes.assign(id, dto.assignedTo, admin.email);
  }

  @Post(':id/notes')
  @Permissions(FEATURE.CRANE_QUOTES, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Append an internal note' })
  @ResponseMessage('Note added')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCraneQuoteNoteDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<CraneQuoteEvent> {
    return this.quotes.addNote(id, dto.note, admin.email);
  }
}
