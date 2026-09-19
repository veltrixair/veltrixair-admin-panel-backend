import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SITE } from '../auth/permissions.constants';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import {
  KnodeDemoOptions,
  MasterDataService,
} from '../master-data/master-data.service';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { DemoRequestResult, KnodeDemoService } from './knode-demo.service';

/**
 * Anonymous surface for knode.veltrixair.com.
 *
 * No CurrentSite decorator: kNODE is an IT-unit product with one website, so
 * the site is pinned rather than resolved from a header a caller controls.
 */
@ApiTags('kNODE demo (public)')
@Controller('knode')
export class PublicKnodeDemoController {
  constructor(
    private readonly demoService: KnodeDemoService,
    private readonly masterData: MasterDataService,
  ) {}

  /**
   * Every dropdown on the Book a demo form, in one response.
   *
   * The website currently hardcodes these six lists in its own bundle. Fetching
   * them instead is the point of this endpoint: two copies of a list is exactly
   * how the crane form's dropdowns drifted out of step with its database.
   *
   * `isLive` on each module is what the form needs to decide whether it is
   * offering a demo or a place on a waiting list.
   */
  @Get('demo-options')
  @ApiOperation({ summary: 'Dropdown options for the Book a demo form' })
  @ResponseMessage('Demo options retrieved')
  getOptions(): Promise<KnodeDemoOptions> {
    return this.masterData.getKnodeDemoOptions(SITE.IT);
  }

  /**
   * 20 per hour per IP — looser than the other public forms, deliberately.
   *
   * Those sit at 5 or 10 because a single visitor has one enquiry to send. This
   * form does not share that shape: kNODE sells to Indian hospitals, where the
   * people filling it in are typically behind one office connection, and a
   * conference stand or a demo day puts a dozen legitimate submissions on the
   * same address within the hour. At 5 the sixth person is turned away with a
   * 429 and no way to understand why.
   *
   * Still a real limit. The throttler also runs before validation, so a
   * malformed request spends one of the twenty — which is the intended
   * behaviour for an unauthenticated write, but worth knowing when a run of
   * test submissions stops working.
   */
  @Post('demo-requests')
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({
    summary:
      'Submit the Book a demo form — intent is derived from the modules picked',
  })
  @ResponseMessage('Request received')
  submit(
    @Body() dto: CreateDemoRequestDto,
    @Req() request: Request,
  ): Promise<DemoRequestResult> {
    return this.demoService.submit(
      dto,
      { ip: request.ip, userAgent: request.get('user-agent') },
      SITE.IT,
    );
  }
}
