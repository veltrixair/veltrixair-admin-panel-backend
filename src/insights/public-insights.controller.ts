import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentSite } from '../common/site/current-site.decorator';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { GatedDownloadDto } from '../files/dto/gated-download.dto';
import {
  GatedDownloadResult,
  GatedDownloadService,
} from '../files/gated-download.service';
import {
  InsightFilterOptions,
  MasterDataService,
} from '../master-data/master-data.service';
import type { ArticleCard } from './dto/article-response.dto';
import { ListArticlesDto } from './dto/list-articles.dto';
import { InsightsService } from './insights.service';

/** Anonymous surface — the card grid on /insights/. */
@ApiTags('Insights (public)')
@Controller('insights')
export class PublicInsightsController {
  constructor(
    private readonly insightsService: InsightsService,
    private readonly masterData: MasterDataService,
    private readonly gatedDownload: GatedDownloadService,
  ) {}

  /** The three filter rows: TYPE, TOPIC, REGION. */
  @Get('filters')
  @ApiOperation({ summary: 'Type, topic and region filter chips' })
  @ResponseMessage('Filters retrieved')
  getFilters(@CurrentSite() siteCode: number): Promise<InsightFilterOptions> {
    return this.masterData.getInsightFilterOptions(siteCode);
  }

  @Get('articles')
  @ApiOperation({
    summary: 'List article cards — filter by type, topic, region and keyword',
  })
  @ResponseMessage('Articles retrieved')
  list(
    @Query() query: ListArticlesDto,
    @CurrentSite() siteCode: number,
  ): Promise<PaginatedResult<ArticleCard>> {
    return this.insightsService.listPublic(query, siteCode);
  }

  /**
   * Gated whitepaper download.
   *
   * The lead is captured first, then a short-lived signed URL is issued. The
   * bucket is private, so this is the only route to the file — there is no
   * public object URL to share around.
   */
  @Post('articles/:slug/download')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Request a gated download — captures a lead, returns a signed URL',
  })
  @ResponseMessage('Download link issued')
  async download(
    @Param('slug') slug: string,
    @Body() dto: GatedDownloadDto,
    @Req() request: Request,
    @CurrentSite() siteCode: number,
  ): Promise<GatedDownloadResult> {
    const article = await this.insightsService.findPublishedBySlug(
      slug,
      siteCode,
    );

    if (!article.assetFileId) {
      throw new NotFoundException(
        'That piece has no downloadable file attached',
      );
    }

    return this.gatedDownload.requestDownload(
      article.assetFileId,
      slug,
      dto,
      { ip: request.ip, userAgent: request.get('user-agent') },
      siteCode,
    );
  }
}
