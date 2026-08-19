import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentSite } from '../common/site/current-site.decorator';
import { MulterExceptionFilter } from '../files/filters/multer-exception.filter';
import type { UploadedFile as MulterFile } from '../files/files.service';
import {
  ApplyFormOptions,
  MasterDataService,
} from '../master-data/master-data.service';
import { ApplicationService } from './application.service';
import type { ApplicationResult, CandidateView } from './application.service';
import { CreateApplicationDto } from './dto/create-application.dto';

/** The RESUME policy caps at 5 MB; multer rejects anything larger up front. */
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/**
 * The candidate-facing surface. Everything here is anonymous — there is no
 * candidate login, by design. A random manage token in the confirmation email
 * is what lets someone check status or withdraw, the same pattern discovery
 * bookings already use.
 */
@ApiTags('Applications (public)')
@Controller('careers')
export class PublicApplicationsController {
  constructor(
    private readonly applications: ApplicationService,
    private readonly masterData: MasterDataService,
  ) {}

  @Get('apply-options')
  @ApiOperation({ summary: 'Dropdown options for the job application form' })
  @ResponseMessage('Form options retrieved')
  getApplyOptions(): Promise<ApplyFormOptions> {
    return this.masterData.getApplyFormOptions();
  }

  /**
   * 10 per hour per IP, looser than the contact form's 5.
   *
   * Applying is not like sending an enquiry: a candidate reasonably applies to
   * several roles in one sitting, and a university careers office or a shared
   * workspace puts many genuine applicants behind one address. Rejected
   * attempts count too, so a few validation failures must not exhaust someone's
   * allowance before they succeed.
   */
  @Post('jobs/:slug/apply')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @UseInterceptors(
    FileInterceptor('resume', { limits: { fileSize: MAX_RESUME_BYTES } }),
  )
  @UseFilters(MulterExceptionFilter)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Apply for a role — multipart, résumé in the "resume" field',
  })
  @ResponseMessage('Application received')
  apply(
    @Param('slug') slug: string,
    @UploadedFile() resume: MulterFile | undefined,
    @Body() dto: CreateApplicationDto,
    @Req() request: Request,
    @CurrentSite() siteCode: number,
  ): Promise<ApplicationResult> {
    if (!resume) {
      throw new BadRequestException(
        'Please attach your résumé in the "resume" field (PDF, DOC or DOCX).',
      );
    }

    return this.applications.submit(
      slug,
      dto,
      resume,
      { ip: request.ip, userAgent: request.get('user-agent') },
      siteCode,
    );
  }

  @Get('applications/:manageToken')
  @ApiOperation({ summary: 'Check an application — no account needed' })
  @ResponseMessage('Application retrieved')
  status(@Param('manageToken') manageToken: string): Promise<CandidateView> {
    return this.applications.findByToken(manageToken);
  }

  @Post('applications/:manageToken/withdraw')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Withdraw an application — deletes the résumé immediately',
  })
  @ResponseMessage('Application withdrawn')
  withdraw(
    @Param('manageToken') manageToken: string,
  ): Promise<{ message: string }> {
    return this.applications.withdraw(manageToken);
  }
}
