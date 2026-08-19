import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CraneSiteVisitService } from './crane-site-visit.service';
import type {
  CustomerVisitView,
  VisitFormOptions,
  VisitResult,
} from './crane-site-visit.service';
import { CreateCraneSiteVisitDto } from './dto/create-crane-site-visit.dto';

/**
 * "Bring an engineer, before we bring a quote."
 *
 * Anonymous, like every public form here. No file upload on this page, so the
 * body is ordinary JSON rather than multipart.
 */
@ApiTags('Crane site visits (public)')
@Controller('crane')
export class PublicCraneSiteVisitController {
  constructor(private readonly visits: CraneSiteVisitService) {}

  @Get('site-visit-options')
  @ApiOperation({ summary: 'Every dropdown on the site visit form' })
  @ResponseMessage('Site visit options retrieved')
  options(): Promise<VisitFormOptions> {
    return this.visits.formOptions();
  }

  /** 10 per hour per IP, matching the quote form. */
  @Post('site-visits')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Request a site visit' })
  @ResponseMessage('Site visit request received')
  submit(
    @Body() dto: CreateCraneSiteVisitDto,
    @Req() request: Request,
  ): Promise<VisitResult> {
    return this.visits.submit(dto, {
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Get('site-visits/:manageToken')
  @ApiOperation({ summary: 'Track a site visit request — no account needed' })
  @ResponseMessage('Site visit request retrieved')
  track(@Param('manageToken') manageToken: string): Promise<CustomerVisitView> {
    return this.visits.findByToken(manageToken);
  }
}
