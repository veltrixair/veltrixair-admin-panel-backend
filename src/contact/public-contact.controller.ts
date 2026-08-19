import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentSite } from '../common/site/current-site.decorator';
import {
  ContactFormOptions,
  MasterDataService,
} from '../master-data/master-data.service';
import { ContactService, EnquirySubmissionResult } from './contact.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';

/**
 * Anonymous surface. Everything here is reachable without authentication,
 * which is exactly why the write endpoint carries its own tight throttle on
 * top of the global one.
 */
@ApiTags('Contact (public)')
@Controller('contact')
export class PublicContactController {
  constructor(
    private readonly contactService: ContactService,
    private readonly masterData: MasterDataService,
  ) {}

  /**
   * Every dropdown on the contact form in one response, so the frontend never
   * hardcodes option lists that can drift from the database.
   */
  @Get('form-options')
  @ApiOperation({ summary: 'Dropdown options for the contact form' })
  @ResponseMessage('Form options retrieved')
  getFormOptions(@CurrentSite() siteCode: number): Promise<ContactFormOptions> {
    return this.masterData.getContactFormOptions(siteCode);
  }

  /** 5 submissions per hour per IP. The global limit is far too loose here. */
  @Post('enquiries')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Submit a detailed enquiry' })
  @ResponseMessage('Enquiry received')
  submit(
    @Body() dto: CreateEnquiryDto,
    @Req() request: Request,
    @CurrentSite() siteCode: number,
  ): Promise<EnquirySubmissionResult> {
    return this.contactService.submit(
      dto,
      { ip: request.ip, userAgent: request.get('user-agent') },
      siteCode,
    );
  }
}
