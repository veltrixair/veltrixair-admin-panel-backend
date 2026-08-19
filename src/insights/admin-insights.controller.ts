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
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FEATURE, PERMISSION } from '../auth/permissions.constants';
import type { AuthenticatedAdmin } from '../auth/permissions.constants';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ListArticlesAdminDto } from './dto/list-articles.dto';
import {
  CreateArticleDto,
  UpdateArticleDto,
  UpdateArticleStatusDto,
} from './dto/upsert-article.dto';
import { AttachAssetDto } from './dto/upsert-article.dto';
import { Article } from './entities/article.entity';
import { InsightsService } from './insights.service';

/** Content editors own this surface; everyone else reads it at most. */
@ApiTags('Insights (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard)
@Controller('admin/insights')
export class AdminInsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('articles')
  @Permissions(FEATURE.INSIGHTS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'List all articles including drafts and archived' })
  @ResponseMessage('Articles retrieved')
  list(
    @Query() query: ListArticlesAdminDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PaginatedResult<Article>> {
    return this.insightsService.listForAdmin(query, admin.siteCode);
  }

  @Get('articles/:id')
  @Permissions(FEATURE.INSIGHTS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Get one article by id' })
  @ResponseMessage('Article retrieved')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<Article> {
    return this.insightsService.findById(id, admin.siteCode);
  }

  @Post('articles')
  @Permissions(FEATURE.INSIGHTS, PERMISSION.CREATE)
  @ApiOperation({ summary: 'Create an article card' })
  @ResponseMessage('Article created')
  create(
    @Body() dto: CreateArticleDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<Article> {
    return this.insightsService.create(dto, admin.siteCode);
  }

  @Patch('articles/:id')
  @Permissions(FEATURE.INSIGHTS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Update an article card' })
  @ResponseMessage('Article updated')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<Article> {
    return this.insightsService.update(id, dto, admin.siteCode);
  }

  @Patch('articles/:id/status')
  @Permissions(FEATURE.INSIGHTS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Publish, unpublish or archive' })
  @ResponseMessage('Status updated')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleStatusDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<Article> {
    return this.insightsService.setStatus(id, dto.status, admin.siteCode);
  }

  /** Attach an uploaded file (POST /admin/files/upload) as the download. */
  @Patch('articles/:id/asset')
  @Permissions(FEATURE.INSIGHTS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Attach a downloadable file to an article' })
  @ResponseMessage('Asset attached')
  attachAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachAssetDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<Article> {
    return this.insightsService.attachAsset(id, dto.fileId, admin.siteCode);
  }

  /** Detaches without deleting — the file may be attached elsewhere. */
  @Delete('articles/:id/asset')
  @Permissions(FEATURE.INSIGHTS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Detach the downloadable file' })
  @ResponseMessage('Asset detached')
  detachAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<Article> {
    return this.insightsService.detachAsset(id, admin.siteCode);
  }

  @Delete('articles/:id')
  @Permissions(FEATURE.INSIGHTS, PERMISSION.DELETE)
  @ApiOperation({ summary: 'Soft-delete an article' })
  @ResponseMessage('Article removed')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ message: string }> {
    return this.insightsService.remove(id, admin.siteCode);
  }
}
