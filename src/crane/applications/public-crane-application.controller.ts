import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CraneApplicationService } from './crane-application.service';
import { CreateCraneApplicationDto } from './dto/create-crane-application.dto';

/**
 * The anonymous surface of the crane careers form.
 *
 * JSON, not multipart — no CV travels with the submission. The page asks
 * candidates to reply to the acknowledgement with it attached instead.
 */
@ApiTags('Crane careers (public)')
@Controller('crane/careers')
export class PublicCraneApplicationController {
  constructor(private readonly applications: CraneApplicationService) {}

  /** 5 applications per hour per IP. The global limit is far too loose here. */
  @Post('apply')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Apply — reference issued, CV requested by email' })
  @ResponseMessage('Application received')
  submit(@Body() dto: CreateCraneApplicationDto, @Req() request: Request) {
    return this.applications.submit(dto, {
      ip: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    });
  }
}
