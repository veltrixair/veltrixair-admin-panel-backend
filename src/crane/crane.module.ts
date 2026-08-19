import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../files/files.module';
import { IndustryMaster } from '../master-data/entities/industry-master.entity';
import { CraneBudgetBandMaster } from './masters/entities/crane-budget-band-master.entity';
import { CraneCompletionTimelineMaster } from './masters/entities/crane-completion-timeline-master.entity';
import { CraneDutyClassMaster } from './masters/entities/crane-duty-class-master.entity';
import { CraneEnvironmentMaster } from './masters/entities/crane-environment-master.entity';
import { CraneLeadSourceMaster } from './masters/entities/crane-lead-source-master.entity';
import { CraneOemMaster } from './masters/entities/crane-oem-master.entity';
import { CranePaymentTermsMaster } from './masters/entities/crane-payment-terms-master.entity';
import { CraneProcurementMaster } from './masters/entities/crane-procurement-master.entity';
import { CraneProposalDocMaster } from './masters/entities/crane-proposal-doc-master.entity';
import { CraneServiceLineMaster } from './masters/entities/crane-service-line-master.entity';
import { CraneSiteAccessMaster } from './masters/entities/crane-site-access-master.entity';
import { CraneSiteCityMaster } from './masters/entities/crane-site-city-master.entity';
import { CraneTypeMaster } from './masters/entities/crane-type-master.entity';
import { CraneUrgencyMaster } from './masters/entities/crane-urgency-master.entity';
import { CraneVisitPurposeMaster } from './masters/entities/crane-visit-purpose-master.entity';
import { CraneVisitUrgencyMaster } from './masters/entities/crane-visit-urgency-master.entity';
import { CraneAgeBandMaster } from './masters/entities/crane-age-band-master.entity';
import { CraneVisitDurationMaster } from './masters/entities/crane-visit-duration-master.entity';
import { CraneVisitTimeMaster } from './masters/entities/crane-visit-time-master.entity';
import { CraneAccessApprovalMaster } from './masters/entities/crane-access-approval-master.entity';
import { CraneEngineerVisaMaster } from './masters/entities/crane-engineer-visa-master.entity';
import { CranePpeProviderMaster } from './masters/entities/crane-ppe-provider-master.entity';
import { CraneHotWorkMaster } from './masters/entities/crane-hot-work-master.entity';
import { CraneTranslatorMaster } from './masters/entities/crane-translator-master.entity';
import { CraneEngagementTypeMaster } from './masters/entities/crane-engagement-type-master.entity';
import { AdminCraneQuoteController } from './quote/admin-crane-quote.controller';
import { CraneQuoteService } from './quote/crane-quote.service';
import { CraneQuoteEvent } from './quote/entities/crane-quote-event.entity';
import { CraneQuoteRequest } from './quote/entities/crane-quote-request.entity';
import { PublicCraneQuoteController } from './quote/public-crane-quote.controller';
import { AdminCraneSiteVisitController } from './site-visit/admin-crane-site-visit.controller';
import { CraneSiteVisitService } from './site-visit/crane-site-visit.service';
import { CraneSiteVisitEvent } from './site-visit/entities/crane-site-visit-event.entity';
import { CraneSiteVisit } from './site-visit/entities/crane-site-visit.entity';
import { PublicCraneSiteVisitController } from './site-visit/public-crane-site-visit.controller';
import { CraneJobPosting } from './careers/entities/crane-job-posting.entity';
import { CraneApplication } from './applications/entities/crane-application.entity';
import { CraneApplicationEvent } from './applications/entities/crane-application-event.entity';
import { CraneCareerTrackMaster } from './masters/entities/crane-career-track-master.entity';
import { CraneExperienceBandMaster } from './masters/entities/crane-experience-band-master.entity';
import { CraneResidencyStatusMaster } from './masters/entities/crane-residency-status-master.entity';
import { CraneAvailabilityMaster } from './masters/entities/crane-availability-master.entity';
import { CraneCareerQualificationMaster } from './masters/entities/crane-career-qualification-master.entity';
import { CraneJobLocationMaster } from './masters/entities/crane-job-location-master.entity';
import { CraneEmploymentTypeMaster } from './masters/entities/crane-employment-type-master.entity';
import { CraneCareerService } from './careers/crane-career.service';
import { CraneApplicationService } from './applications/crane-application.service';
import { PublicCraneCareerController } from './careers/public-crane-career.controller';
import { AdminCraneCareerController } from './careers/admin-crane-career.controller';
import { PublicCraneApplicationController } from './applications/public-crane-application.controller';
import { AdminCraneApplicationController } from './applications/admin-crane-application.controller';

/**
 * Veltrixair Industries — the crane business.
 *
 * Site-specific, so the directory and every file inside it carry the site's
 * slug. Unlike the other feature modules this is a whole website rather than
 * one capability, so it is laid out by feature underneath:
 *
 *   masters/     lookup tables shared by every crane feature
 *   quote/       request a quote
 *   site-visit/  request a site visit
 *
 * Those are FOLDERS, not modules. The features share eight master tables
 * between them — crane type, OEM, city, access regime, environment, service
 * line, lead source — so splitting them into separate Nest modules would need
 * a third module just to export those, three modules doing what one does. A
 * folder becomes a module the day it stops sharing.
 *
 * IndustryMaster is the exception to "crane masters live here": it is a SHARED
 * table with a per-brand code range, owned by master-data and imported.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      // masters
      CraneServiceLineMaster,
      CraneUrgencyMaster,
      CraneLeadSourceMaster,
      CraneSiteCityMaster,
      CraneSiteAccessMaster,
      CraneTypeMaster,
      CraneOemMaster,
      CraneEnvironmentMaster,
      CraneDutyClassMaster,
      CraneBudgetBandMaster,
      CraneCompletionTimelineMaster,
      CraneProcurementMaster,
      CranePaymentTermsMaster,
      CraneProposalDocMaster,
      IndustryMaster,
      CraneVisitPurposeMaster,
      CraneVisitUrgencyMaster,
      CraneAgeBandMaster,
      CraneVisitDurationMaster,
      CraneVisitTimeMaster,
      CraneAccessApprovalMaster,
      CraneEngineerVisaMaster,
      CranePpeProviderMaster,
      CraneHotWorkMaster,
      CraneTranslatorMaster,
      CraneEngagementTypeMaster,
      // quote
      CraneQuoteRequest,
      CraneQuoteEvent,
      // site visit
      CraneSiteVisit,
      CraneSiteVisitEvent,
      CraneJobPosting,
      CraneApplication,
      CraneApplicationEvent,
      CraneCareerTrackMaster,
      CraneExperienceBandMaster,
      CraneResidencyStatusMaster,
      CraneAvailabilityMaster,
      CraneCareerQualificationMaster,
      CraneJobLocationMaster,
      CraneEmploymentTypeMaster,
    ]),
    FilesModule,
  ],
  controllers: [
    PublicCraneQuoteController,
    AdminCraneQuoteController,
    PublicCraneSiteVisitController,
    AdminCraneSiteVisitController,

    PublicCraneCareerController,
    AdminCraneCareerController,
    PublicCraneApplicationController,
    AdminCraneApplicationController,
  ],
  providers: [
    CraneQuoteService,
    CraneSiteVisitService,
    CraneCareerService,
    CraneApplicationService,
  ],
  exports: [CraneQuoteService, CraneSiteVisitService],
})
export class CraneModule {}
