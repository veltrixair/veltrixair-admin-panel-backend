import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobPosting } from '../careers/entities/job-posting.entity';
import { FilesModule } from '../files/files.module';
import { AdminApplicationsController } from './admin-applications.controller';
import { ApplicationService } from './application.service';
import { JobApplicationEvent } from './entities/job-application-event.entity';
import { JobApplication } from './entities/job-application.entity';
import { PublicApplicationsController } from './public-applications.controller';

/**
 * Its own module because it owns tables — job_applications and their events.
 * JobPosting is registered read-only, to resolve a slug to the role being
 * applied for; careers still owns it.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([JobApplication, JobApplicationEvent, JobPosting]),
    FilesModule,
  ],
  controllers: [PublicApplicationsController, AdminApplicationsController],
  providers: [ApplicationService],
  exports: [ApplicationService],
})
export class ApplicationsModule {}
