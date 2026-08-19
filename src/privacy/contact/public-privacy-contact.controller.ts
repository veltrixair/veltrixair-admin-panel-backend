import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CreatePrivacyContactDto } from './dto/create-privacy-contact.dto';
import { PrivacyContactService } from './privacy-contact.service';

/**
 * The anonymous surface of dataprivacy.veltrixair.com/contact/.
 *
 * Separate file from the admin controller so "can an unauthenticated caller
 * reach this?" is answerable from the filename.
 */
@ApiTags('Privacy contact (public)')
@Controller('privacy')
export class PublicPrivacyContactController {
  constructor(private readonly enquiries: PrivacyContactService) {}

  @Get('contact-options')
  @ApiOperation({ summary: 'Jurisdictions and services for the contact form' })
  @ResponseMessage('Options retrieved')
  options() {
    return this.enquiries.formOptions();
  }

  /** 5 submissions per hour per IP. The global limit is far too loose here. */
  @Post('enquiries')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Brief the practice' })
  @ResponseMessage('Brief received')
  submit(@Body() dto: CreatePrivacyContactDto, @Req() request: Request) {
    return this.enquiries.submit(dto, {
      ip: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    });
  }
}
