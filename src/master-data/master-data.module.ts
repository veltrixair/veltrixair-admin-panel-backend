import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationSourceMaster } from './entities/application-source-master.entity';
import { CountryMaster } from './entities/country-master.entity';
import { NoticePeriodMaster } from './entities/notice-period-master.entity';
import { QualificationMaster } from './entities/qualification-master.entity';
import { WorkAuthorisationMaster } from './entities/work-authorisation-master.entity';
import { EnquiryTimelineMaster } from './entities/enquiry-timeline-master.entity';
import { EnquiryTopicMaster } from './entities/enquiry-topic-master.entity';
import { Architect } from '../discovery/entities/architect.entity';
import { ArticleTopicMaster } from './entities/article-topic-master.entity';
import { DiscoveryPracticeMaster } from './entities/discovery-practice-master.entity';
import { ArticleTypeMaster } from './entities/article-type-master.entity';
import { IndustryMaster } from './entities/industry-master.entity';
import { RegionMaster } from './entities/region-master.entity';
import { JobLocationMaster } from './entities/job-location-master.entity';
import { OfficeMaster } from './entities/office-master.entity';
import { PracticeAreaMaster } from './entities/practice-area-master.entity';
import { SiteMaster } from './entities/site-master.entity';
import { MasterDataService } from './master-data.service';

/**
 * Central registry for lookup tables. Global so feature modules can resolve
 * masters without re-importing, and so their @ManyToOne relations resolve at
 * startup (autoLoadEntities picks up every forFeature() entity).
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      EnquiryTopicMaster,
      EnquiryTimelineMaster,
      CountryMaster,
      IndustryMaster,
      OfficeMaster,
      PracticeAreaMaster,
      JobLocationMaster,
      ArticleTypeMaster,
      ArticleTopicMaster,
      RegionMaster,
      DiscoveryPracticeMaster,
      Architect,
      QualificationMaster,
      NoticePeriodMaster,
      WorkAuthorisationMaster,
      ApplicationSourceMaster,
      SiteMaster,
    ]),
  ],
  providers: [MasterDataService],
  exports: [MasterDataService, TypeOrmModule],
})
export class MasterDataModule {}
