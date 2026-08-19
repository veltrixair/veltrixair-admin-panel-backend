import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminContactController } from './admin-contact.controller';
import { ContactService } from './contact.service';
import { ContactEnquiryEvent } from './entities/contact-enquiry-event.entity';
import { ContactEnquiry } from './entities/contact-enquiry.entity';
import { EnquiryRoutingService } from './enquiry-routing.service';
import { PublicContactController } from './public-contact.controller';

/**
 * One service, two controllers — the anonymous surface and the staff surface
 * are separate files so "can an unauthenticated caller reach this?" is
 * answerable from the filename.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ContactEnquiry, ContactEnquiryEvent])],
  controllers: [PublicContactController, AdminContactController],
  providers: [ContactService, EnquiryRoutingService],
  exports: [ContactService],
})
export class ContactModule {}
