import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { LocalStorageService } from './storage/local-storage.service';
import { STORAGE_PROVIDER } from './storage/storage.provider';
import type { StorageProvider } from './storage/storage.provider';

/**
 * Serves objects for the local filesystem driver only.
 *
 * Exists so signed URLs resolve to something when running without Supabase
 * credentials. Under Supabase the signed URL points at Supabase and nothing
 * should ever reach this route — so it refuses outright rather than sitting
 * there as an unauthenticated read path nobody remembers is registered.
 *
 * Hidden from the API docs because it is not part of the real surface.
 */
@ApiExcludeController()
@Controller('files/local')
export class LocalFilesController {
  constructor(
    private readonly local: LocalStorageService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  @Get(':key')
  async serve(
    @Param('key') key: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() res: Response,
  ): Promise<void> {
    if (this.storage.name !== 'local') {
      throw new NotFoundException();
    }

    const buffer = await this.local.read(
      decodeURIComponent(key),
      Number(expires),
      signature,
    );
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);
  }
}
