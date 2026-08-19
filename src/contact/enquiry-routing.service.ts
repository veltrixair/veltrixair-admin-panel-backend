import { Injectable } from '@nestjs/common';
import { addBusinessDays } from '../common/utils/business-hours.util';
import { CountryMaster } from '../master-data/entities/country-master.entity';
import { EnquiryTopicMaster } from '../master-data/entities/enquiry-topic-master.entity';
import { OfficeMaster } from '../master-data/entities/office-master.entity';
import { MasterDataService } from '../master-data/master-data.service';

/** "A senior practitioner will review your message and respond within one business day." */
export const CONTACT_SLA_BUSINESS_DAYS = 1;

export interface RoutingDecision {
  topic: EnquiryTopicMaster;
  country: CountryMaster;
  office: OfficeMaster;
  /** Inbox this topic is delivered to — contact@ / privacy@ / voiceai@. */
  routedToEmail: string;
  slaDueAt: Date;
}

/**
 * Decides where an enquiry goes and when it is due.
 *
 * Both rules live in master data rather than in code: topic → inbox on
 * `enquiry_topic_masters.route_email`, country → office on
 * `country_masters.office_code`. Routing changes are a data edit, not a deploy.
 */
@Injectable()
export class EnquiryRoutingService {
  constructor(private readonly masterData: MasterDataService) {}

  async resolve(
    siteCode: number,
    topicCode: number,
    countryCode: number,
    submittedAt: Date,
  ): Promise<RoutingDecision> {
    // Topics and offices are per-brand, so the brand is part of the lookup.
    // Without it a request to one brand's domain could name another brand's
    // topic and be delivered to that brand's inbox, while the stored row still
    // carried the submitting site.
    const [topic, country] = await Promise.all([
      this.masterData.findTopicOrFail(topicCode, siteCode),
      // Countries are shared — a client in Saudi Arabia is in Saudi Arabia
      // whichever practice they write to. The office it resolves to is scoped.
      this.masterData.findCountryOrFail(countryCode),
    ]);

    const office = await this.masterData.findOfficeOrFail(
      country.officeCode,
      siteCode,
    );

    // The SLA clock runs on the owning office's calendar, not the server's.
    const slaDueAt = addBusinessDays(submittedAt, CONTACT_SLA_BUSINESS_DAYS, {
      timezone: office.timezone,
      workingDays: office.workingDays,
      workStartHour: office.workStartHour,
      workEndHour: office.workEndHour,
    });

    return {
      topic,
      country,
      office,
      routedToEmail: topic.routeEmail,
      slaDueAt,
    };
  }
}
