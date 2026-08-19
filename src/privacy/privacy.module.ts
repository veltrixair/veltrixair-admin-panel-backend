import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfficeMaster } from '../master-data/entities/office-master.entity';
import { AdminPrivacyContactController } from './contact/admin-privacy-contact.controller';
import { PrivacyContactEvent } from './contact/entities/privacy-contact-event.entity';
import { PrivacyContactEnquiry } from './contact/entities/privacy-contact-enquiry.entity';
import { PrivacyContactService } from './contact/privacy-contact.service';
import { PublicPrivacyContactController } from './contact/public-privacy-contact.controller';
import { PrivacyJurisdictionMaster } from './masters/entities/privacy-jurisdiction-master.entity';
import { PrivacyServiceMaster } from './masters/entities/privacy-service-master.entity';

/**
 * dataprivacy.veltrixair.com.
 *
 * One module with folders rather than a module per feature, the same shape as
 * CraneModule: `masters/` sits at the root because the jurisdictions belong to
 * the practice, not to the contact form — when data subject requests or breach
 * intake arrive, they use the same list rather than a second copy of it.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PrivacyContactEnquiry,
      PrivacyContactEvent,
      PrivacyJurisdictionMaster,
      PrivacyServiceMaster,
      OfficeMaster,
    ]),
  ],
  controllers: [PublicPrivacyContactController, AdminPrivacyContactController],
  providers: [PrivacyContactService],
  exports: [PrivacyContactService],
})
export class PrivacyModule {}
