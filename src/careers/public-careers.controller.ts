import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentSite } from '../common/site/current-site.decorator';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import {
  CareerFilterOptions,
  MasterDataService,
} from '../master-data/master-data.service';
import { CareersService } from './careers.service';
import { ListJobsDto } from './dto/list-jobs.dto';
import { WORK_MODE_OPTIONS } from './dto/job-response.dto';
import type {
  JobDetail,
  JobListItem,
  WorkModeOption,
} from './dto/job-response.dto';

export interface CareerFilters extends CareerFilterOptions {
  workModes: WorkModeOption[];
}

/** Anonymous surface — read-only listings for /careers/. */
@ApiTags('Careers (public)')
@Controller('careers')
export class PublicCareersController {
  constructor(
    private readonly careersService: CareersService,
    private readonly masterData: MasterDataService,
  ) {}

  /**
   * Filter chip values, so the frontend never hardcodes them.
   *
   * Locations are cities only. "Remote" is a work arrangement rather than a
   * place, so it appears under workModes.
   */
  @Get('filters')
  @ApiOperation({ summary: 'Practice, location and work-mode filter options' })
  @ResponseMessage('Filters retrieved')
  async getFilters(@CurrentSite() siteCode: number): Promise<CareerFilters> {
    const options = await this.masterData.getCareerFilterOptions(siteCode);
    return { ...options, workModes: WORK_MODE_OPTIONS };
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'List open roles — filter by practice, location and keyword',
  })
  @ResponseMessage('Jobs retrieved')
  list(
    @Query() query: ListJobsDto,
    @CurrentSite() siteCode: number,
  ): Promise<PaginatedResult<JobListItem>> {
    return this.careersService.listPublic(query, siteCode);
  }

  /** Backs the "View" action on a role card. */
  @Get('jobs/:slug')
  @ApiOperation({
    summary: 'Get one open role by slug — full detail for the job page',
  })
  @ResponseMessage('Job retrieved')
  findOne(
    @Param('slug') slug: string,
    @CurrentSite() siteCode: number,
  ): Promise<JobDetail> {
    return this.careersService.findBySlug(slug, siteCode);
  }
}
