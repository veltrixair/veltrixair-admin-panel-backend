import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { PaginatedResult } from '../../common/dto/pagination-query.dto';
import { CraneCareerService } from './crane-career.service';
import { ListCraneJobsDto } from './dto/upsert-crane-job.dto';
import { CraneJobPosting } from './entities/crane-job-posting.entity';

/**
 * veltrixairindustries.com/careers/ — the board and one advert.
 *
 * The application form's dropdowns come from here too, so a candidate page
 * makes one call rather than guessing codes.
 */
@ApiTags('Crane careers (public)')
@Controller('crane/careers')
export class PublicCraneCareerController {
  constructor(private readonly careers: CraneCareerService) {}

  @Get('options')
  @ApiOperation({ summary: 'Every dropdown on the careers page and its form' })
  @ResponseMessage('Options retrieved')
  options() {
    return this.careers.options();
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Open roles — filter by track and location' })
  @ResponseMessage('Roles retrieved')
  list(
    @Query() query: ListCraneJobsDto,
  ): Promise<PaginatedResult<CraneJobPosting>> {
    return this.careers.listPublic(query);
  }

  @Get('jobs/:slug')
  @ApiOperation({ summary: 'One open role in full' })
  @ResponseMessage('Role retrieved')
  findOne(@Param('slug') slug: string): Promise<CraneJobPosting> {
    return this.careers.findBySlug(slug);
  }
}
