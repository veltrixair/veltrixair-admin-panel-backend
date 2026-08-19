import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { CareersModule } from './careers/careers.module';
import { CraneModule } from './crane/crane.module';
import { PrivacyModule } from './privacy/privacy.module';
import { CommonModule } from './common/common.module';
import { validateEnv } from './config/env.validation';
import { ContactModule } from './contact/contact.module';
import { DatabaseModule } from './database/database.module';
import { FilesModule } from './files/files.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { InsightsModule } from './insights/insights.module';
import { MailModule } from './mail/mail.module';
import { MasterDataModule } from './master-data/master-data.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        process.env.NODE_ENV === 'production'
          ? 'config/prod.env'
          : 'config/dev.env',
      ],
      validate: validateEnv,
    }),

    // Baseline limit for every route. Public write endpoints (contact form,
    // job applications) tighten this with their own @Throttle().
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: parseInt(config.get<string>('THROTTLE_TTL', '60000'), 10),
          limit: parseInt(config.get<string>('THROTTLE_LIMIT', '100'), 10),
        },
      ],
    }),

    DatabaseModule,

    // @Global — shared by every public-facing form.
    CommonModule,
    // @Global — every admin controller resolves its guards from here. Also
    // serves /admin/staff, since staff accounts are this module's tables.
    AuthModule,
    MailModule,
    MasterDataModule,
    FilesModule,

    // Feature modules
    ContactModule,
    CareersModule,
    ApplicationsModule,

    // Site-specific: Veltrixair Industries
    CraneModule,
    PrivacyModule,
    InsightsModule,
    DiscoveryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
