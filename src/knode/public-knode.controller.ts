import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { SITE } from '../auth/permissions.constants';
import { CreateKnodeLeadDto } from './dto/create-knode-lead.dto';
import { KnodeLeadResult, KnodeService } from './knode.service';

/**
 * The deck's surface.
 *
 * Not a website form — the caller is the Knode product deck running on a sales
 * rep's laptop, which is why there is no CurrentSite decorator here: the deck
 * is an IT-unit product and has no brand to resolve. The site is pinned.
 *
 * One route: a lead is posted when the rep saves it, and stored. It is still
 * idempotent on the lead's `clientKey`, so a deck that retries after a dropped
 * connection cannot create the same lead twice.
 */
@ApiTags('Knode (deck)')
@ApiHeader({
  name: 'X-Knode-Key',
  description:
    'Shared key issued to the deck. Required once KNODE_API_KEY is configured.',
  required: false,
})
@Controller('knode')
export class PublicKnodeController {
  constructor(
    private readonly knodeService: KnodeService,
    private readonly config: ConfigService,
  ) {}

  /**
   * One lead, sent the moment the rep saves it and the network allows.
   *
   * 100 per hour per IP. Higher than any of the website forms because the
   * caller is not a visitor with one enquiry — it is the deck, posting each
   * lead as a rep captures it, and a conference stand produces them in bursts
   * that a per-visitor limit would read as abuse.
   *
   * The real protection here is the shared key below, not the ceiling. This
   * exists to bound the damage if that key ever escapes the laptop it lives on.
   */
  @Post('leads')
  @Throttle({ default: { limit: 100, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Capture one lead from the deck' })
  @ResponseMessage('Lead received')
  capture(
    @Body() dto: CreateKnodeLeadDto,
    @Req() request: Request,
  ): Promise<KnodeLeadResult> {
    this.assertKey(request);

    return this.knodeService.capture(
      dto,
      { ip: request.ip, userAgent: request.get('user-agent') },
      SITE.IT,
    );
  }

  /**
   * Shared-key check, skipped while no key is configured.
   *
   * The same shape as TURNSTILE_SECRET elsewhere: the guard activates the
   * moment a secret exists, so the deck can be wired up before the key is
   * issued without either side being broken in the meantime.
   *
   * A shared key is not strong authentication — it is in a file on a laptop.
   * It is here to keep an open write endpoint from being trivially flooded,
   * and the throttle above is the second half of that.
   */
  private assertKey(request: Request): void {
    const expected = this.config.get<string>('KNODE_API_KEY');
    if (!expected) return;

    if (request.get('x-knode-key') !== expected) {
      throw new ForbiddenException('Invalid deck key');
    }
  }
}
