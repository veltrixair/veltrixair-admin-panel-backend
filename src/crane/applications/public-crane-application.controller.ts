import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import type { UploadedFile } from '../../files/files.service';
import { MAX_CERTIFICATES } from './crane-application.constants';
import { CraneApplicationService } from './crane-application.service';
import { CreateCraneApplicationDto } from './dto/create-crane-application.dto';

/** 5 MB each — a CV and a photographed ticket are both small. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * The anonymous surface of the crane careers form.
 *
 * Multipart, because the CV and up to four certificates travel with it. That
 * replaced an email round trip: the acknowledgement used to ask candidates to
 * reply with their CV attached, which worked only as well as the mail
 * transport, and left the file outside retention until an admin moved it.
 */
@ApiTags('Crane careers (public)')
@Controller('crane/careers')
export class PublicCraneApplicationController {
  constructor(private readonly applications: CraneApplicationService) {}

  /** 5 applications per hour per IP. The global limit is far too loose here. */
  @Post('apply')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'resume', maxCount: 1 },
        { name: 'certificates', maxCount: MAX_CERTIFICATES },
      ],
      { limits: { fileSize: MAX_UPLOAD_BYTES } },
    ),
  )
  @ApiOperation({
    summary: 'Apply — multipart, CV required, up to 4 certificates',
  })
  @ResponseMessage('Application received')
  submit(
    @Body() dto: CreateCraneApplicationDto,
    @UploadedFiles()
    files: { resume?: UploadedFile[]; certificates?: UploadedFile[] },
    @Req() request: Request,
  ) {
    const resume = files?.resume?.[0];
    if (!resume) {
      throw new BadRequestException(
        'Attach your CV in the "resume" field (PDF, DOC or DOCX).',
      );
    }

    return this.applications.submit(
      dto,
      { resume, certificates: files?.certificates ?? [] },
      {
        ip: request.ip,
        userAgent: request.get('user-agent') ?? undefined,
      },
    );
  }
}
