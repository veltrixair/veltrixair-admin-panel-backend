import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminFilesController } from './admin-files.controller';
import { AssetDownloadRequest } from './entities/asset-download-request.entity';
import { StoredFile } from './entities/stored-file.entity';
import { FilesService } from './files.service';
import { GatedDownloadService } from './gated-download.service';
import { LocalFilesController } from './local-files.controller';
import { LocalStorageService } from './storage/local-storage.service';
import { S3StorageService } from './storage/s3-storage.service';
import { STORAGE_PROVIDER } from './storage/storage.provider';
import { SupabaseStorageService } from './storage/supabase-storage.service';
import { NoopVirusScanner, VIRUS_SCANNER } from './validation/virus-scanner';

/**
 * File storage.
 *
 * Three drivers, chosen by STORAGE_DRIVER:
 *
 *   s3        production on AWS. Never selected implicitly — it has to be
 *             asked for, so a developer's machine is never caught writing to
 *             the production bucket by accident.
 *   supabase  the default while SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *             are both present.
 *   local     the fallback, so the upload pipeline still works with no
 *             credentials at all. Unsuitable for production, and says so on
 *             startup.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([StoredFile, AssetDownloadRequest])],
  controllers: [AdminFilesController, LocalFilesController],
  providers: [
    FilesService,
    GatedDownloadService,
    LocalStorageService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalStorageService],
      useFactory: (config: ConfigService, local: LocalStorageService) => {
        const hasSupabase =
          !!config.get<string>('SUPABASE_URL') &&
          !!config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
        const driver = config.get<string>(
          'STORAGE_DRIVER',
          hasSupabase ? 'supabase' : 'local',
        );

        // Announced here rather than in the local service's constructor: that
        // class is always instantiated (the local download route depends on
        // it), so warning there fired even when Supabase was the active
        // driver — a log line that said the opposite of what was happening.
        const logger = new Logger('FileStorage');
        if (driver === 's3') {
          logger.log(
            `Using S3 — bucket "${config.getOrThrow<string>('S3_BUCKET')}"`,
          );
          return new S3StorageService(config);
        }

        if (driver === 'supabase') {
          logger.log(
            `Using Supabase Storage — bucket "${config.get<string>('SUPABASE_STORAGE_BUCKET', 'veltrixair-assets')}"`,
          );
          return new SupabaseStorageService(config);
        }

        logger.warn(
          'Using local filesystem storage — development only. Set ' +
            'STORAGE_DRIVER=s3 with S3_BUCKET and AWS_REGION for production, ' +
            'or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for Supabase.',
        );
        return local;
      },
    },
    { provide: VIRUS_SCANNER, useClass: NoopVirusScanner },
  ],
  exports: [FilesService, GatedDownloadService, STORAGE_PROVIDER],
})
export class FilesModule {}
