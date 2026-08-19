import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FEATURE, PERMISSION } from '../auth/permissions.constants';
import type { AuthenticatedAdmin } from '../auth/permissions.constants';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { StoredFile, FILE_PURPOSES } from './entities/stored-file.entity';
import type { FilePurpose } from './entities/stored-file.entity';
import { MulterExceptionFilter } from './filters/multer-exception.filter';
import { FilesService } from './files.service';
import type { UploadedFile as MulterFile } from './files.service';

export class UploadFileDto {
  @IsIn(FILE_PURPOSES)
  purpose: FilePurpose;
}

/** The largest any purpose allows; per-purpose caps are enforced in the service. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * `uploaded_by` on every stored file is now the signed-in admin's email rather
 * than null, which is what makes the registry answer "who put this here".
 */
@ApiTags('Files (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard)
@Controller('admin/files')
export class AdminFilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @Permissions(FEATURE.FILES, PERMISSION.CREATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  @UseFilters(MulterExceptionFilter)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a file — contents are verified by magic bytes',
  })
  @ResponseMessage('File uploaded')
  upload(
    @UploadedFile() file: MulterFile | undefined,
    @Body() dto: UploadFileDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<StoredFile> {
    if (!file) {
      throw new BadRequestException('No file was sent in the "file" field');
    }
    return this.filesService.upload(
      file,
      dto.purpose,
      admin.email,
      admin.siteCode,
    );
  }

  @Get()
  @Permissions(FEATURE.FILES, PERMISSION.VIEW)
  @ApiOperation({ summary: 'List stored files' })
  @ResponseMessage('Files retrieved')
  list(
    @CurrentUser() admin: AuthenticatedAdmin,
    @Query('purpose') purpose?: FilePurpose,
  ): Promise<StoredFile[]> {
    return this.filesService.list(admin.siteCode, purpose);
  }

  @Get(':id')
  @Permissions(FEATURE.FILES, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Get file metadata' })
  @ResponseMessage('File retrieved')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<StoredFile> {
    return this.filesService.findById(id, admin.siteCode);
  }

  @Get(':id/download-url')
  @Permissions(FEATURE.FILES, PERMISSION.VIEW)
  @ApiOperation({ summary: 'Time-limited signed URL for the object' })
  @ResponseMessage('Download link issued')
  downloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ) {
    return this.filesService.downloadUrl(id, admin.siteCode);
  }

  @Delete(':id')
  @Permissions(FEATURE.FILES, PERMISSION.DELETE)
  @ApiOperation({ summary: 'Delete the object and its registry row' })
  @ResponseMessage('File deleted')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ message: string }> {
    return this.filesService.remove(id, admin.siteCode);
  }

  /** Runs the retention purge on demand; intended for a scheduled job. */
  @Post('purge-expired')
  @Permissions(FEATURE.FILES, PERMISSION.DELETE)
  @ApiOperation({ summary: 'Delete every file past its retention date' })
  @ResponseMessage('Retention purge complete')
  purge(): Promise<{ purged: number; failed: number }> {
    return this.filesService.purgeExpired();
  }
}
