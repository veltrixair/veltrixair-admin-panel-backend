import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteMaster } from '../master-data/entities/site-master.entity';
import { ReferenceNumberService } from './services/reference-number.service';
import { SpamCheckService } from './services/spam-check.service';
import { SiteContextMiddleware } from './site/site-context.middleware';

/**
 * Cross-cutting services shared by every public-facing form: contact,
 * job applications, newsletter signup and discovery-call booking.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SiteMaster])],
  providers: [ReferenceNumberService, SpamCheckService, SiteContextMiddleware],
  exports: [ReferenceNumberService, SpamCheckService],
})
export class CommonModule implements NestModule {
  /**
   * Site resolution applies to the PUBLIC surface only.
   *
   * Admin routes are excluded deliberately: their brand comes from the signed
   * token, and letting a header reach them would hand the caller a way to pick
   * their own scope. `/api/docs` is excluded because Swagger is served from
   * wherever a developer happens to be, and a 400 there would just be noise.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(SiteContextMiddleware)
      .exclude('admin/(.*)', 'api/docs/(.*)', 'api/docs', '/')
      .forRoutes(
        'contact',
        'careers',
        'insights',
        'discovery',
        'crane',
        'privacy',
        'files',
      );
  }
}
