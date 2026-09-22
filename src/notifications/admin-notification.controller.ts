import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import type { AuthenticatedAdmin } from '../auth/permissions.constants';
import { ListNotificationsDto } from './dto/notification.dto';
import {
  NotificationService,
  type NotificationRow,
} from './notification.service';

/**
 * Your own notifications.
 *
 * Deliberately without `@Permissions`. There is no "notifications feature" to
 * hold — everyone signed in has a feed, and what appears in it is decided per
 * row by whether the role they signed in as can VIEW the thing being announced.
 * Gating the endpoint itself would be the wrong axis: it would either hide the
 * bell from people who have plenty to read, or grant a blanket permission that
 * says nothing about what any given row contains.
 *
 * Everything here is implicitly scoped to the caller — there is no route that
 * reads somebody else's feed, and no id in any path that could name one.
 */
@ApiTags('Admin · Notifications')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard)
@Controller('admin/notifications')
export class AdminNotificationController {
  constructor(private readonly notifications: NotificationService) {}

  /**
   * The unread badge.
   *
   * Declared before `:id` routes for clarity rather than necessity — "count"
   * is not a uuid, so the pipe on the other route would reject it anyway, but
   * a reader should not have to work that out.
   */
  @Get('count')
  @ApiOperation({ summary: 'How many unread notifications you have' })
  @ResponseMessage('Unread count retrieved')
  count(@CurrentUser() admin: AuthenticatedAdmin): Promise<{ unread: number }> {
    return this.notifications.unreadCount(
      admin.id,
      admin.siteCode,
      admin.roleCode,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Your feed — filtered to this dashboard and what your role may see',
  })
  @ResponseMessage('Notifications retrieved')
  list(
    @Query() query: ListNotificationsDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PaginatedResult<NotificationRow>> {
    return this.notifications.list(
      query,
      admin.id,
      admin.siteCode,
      admin.roleCode,
    );
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark everything you can currently see as read' })
  @ResponseMessage('Notifications marked as read')
  readAll(
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ marked: number }> {
    return this.notifications.markAllRead(
      admin.id,
      admin.siteCode,
      admin.roleCode,
    );
  }

  /**
   * Marking one read answers 200 with `marked: 0` for a notification the
   * caller cannot see, rather than 403 or 404 — the three cases "no such id",
   * "another dashboard's" and "not yours to read" are kept indistinguishable
   * so ids cannot be used to discover what exists.
   */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ResponseMessage('Notification marked as read')
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ marked: number }> {
    return this.notifications.markRead(
      id,
      admin.id,
      admin.siteCode,
      admin.roleCode,
    );
  }
}
