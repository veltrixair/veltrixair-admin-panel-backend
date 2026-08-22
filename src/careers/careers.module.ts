import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobLocationMaster } from '../master-data/entities/job-location-master.entity';
import { AdminCareersController } from './admin-careers.controller';
import { CareersService } from './careers.service';
import { JobApplication } from '../applications/entities/job-application.entity';
import { JobPosting } from './entities/job-posting.entity';
import { PublicCareersController } from './public-careers.controller';

/**
 * Scope A — job listings only. Applications, résumé upload and the hiring
 * pipeline are deliberately out of scope; the site currently routes all
 * applications to careers@veltrixair.com.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([JobPosting, JobLocationMaster, JobApplication]),
  ],
  controllers: [PublicCareersController, AdminCareersController],
  providers: [CareersService],
  exports: [CareersService],
})
export class CareersModule {}
