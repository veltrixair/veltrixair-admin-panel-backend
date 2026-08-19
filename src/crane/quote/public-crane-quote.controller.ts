import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { MulterExceptionFilter } from '../../files/filters/multer-exception.filter';
import type { UploadedFile as MulterFile } from '../../files/files.service';
import { CraneQuoteService } from './crane-quote.service';
import type {
  CustomerQuoteView,
  QuoteFormOptions,
  QuoteResult,
} from './crane-quote.service';
import { CreateCraneQuoteDto } from './dto/create-crane-quote.dto';

/** The QUOTE_ATTACHMENT policy caps each file at 20 MB. */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

/**
 * The customer-facing surface for veltrixairindustries.com/quote/.
 *
 * Anonymous, like every public form here. A random manage token in the
 * acknowledgement email lets someone check progress without an account.
 */
@ApiTags('Crane quotes (public)')
@Controller('crane')
export class PublicCraneQuoteController {
  constructor(private readonly quotes: CraneQuoteService) {}

  @Get('quote-options')
  @ApiOperation({
    summary: 'Every dropdown on the quote form, plus the conditional questions',
  })
  @ResponseMessage('Quote options retrieved')
  options(): Promise<QuoteFormOptions> {
    return this.quotes.formOptions();
  }

  /**
   * 10 per hour per IP. Deliberately not exempting emergencies: a customer
   * whose plant is down might submit twice, and 10 is generous enough to
   * absorb that without opening a hole.
   */
  @Post('quotes')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @UseInterceptors(
    FilesInterceptor('attachments', MAX_ATTACHMENTS, {
      limits: { fileSize: MAX_ATTACHMENT_BYTES },
    }),
  )
  @UseFilters(MulterExceptionFilter)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Request a quote — multipart, attachments in "attachments"',
  })
  @ResponseMessage('Quote request received')
  submit(
    @UploadedFiles() attachments: MulterFile[] | undefined,
    @Body() dto: CreateCraneQuoteDto,
    @Req() request: Request,
  ): Promise<QuoteResult> {
    return this.quotes.submit(dto, attachments ?? [], {
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Get('quotes/:manageToken')
  @ApiOperation({ summary: 'Track a quote request — no account needed' })
  @ResponseMessage('Quote request retrieved')
  track(@Param('manageToken') manageToken: string): Promise<CustomerQuoteView> {
    return this.quotes.findByToken(manageToken);
  }
}
