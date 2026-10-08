import { Injectable } from '@nestjs/common';
import { addBusinessDays } from '../common/utils/business-hours.util';
import { CountryMaster } from '../master-data/entities/country-master.entity';
import { OfficeMaster } from '../master-data/entities/office-master.entity';
import { MasterDataService } from '../master-data/master-data.service';

/** "A senior practitioner will review your message and respond within one business day." */
export const CONTACT_SLA_BUSINESS_DAYS = 1;

export interface RoutingDecision {
  country: CountryMaster;
  office: OfficeMaster;
  /** Inbox the owning office reads. */
  routedToEmail: string;
  slaDueAt: Date;
}

/**
 * Decides where an enquiry goes and when it is due.
 *
 * One chain, read from master data rather than code: country → office on
 * `country_masters.office_code`, and the office supplies both the inbox and the
 * working calendar. Routing changes stay a data edit, not a deploy.
 *
 * The enquiry used to carry a topic, and the topic chose the inbox — so a
 * privacy question could reach privacy@ and a Voice AI question voiceai@. That
 * was removed because the website's contact form never asked for one. With it
 * gone, every enquiry from a country goes to the office that owns that country,
 * and sorting by subject is a job for whoever reads the inbox.
 */
@Injectable()
export class EnquiryRoutingService {
  constructor(private readonly masterData: MasterDataService) {}

  async resolve(
    siteCode: number,
    countryCode: number,
    submittedAt: Date,
  ): Promise<RoutingDecision> {
    // Countries are shared — a client in Saudi Arabia is in Saudi Arabia
    // whichever practice they write to. The office it resolves to is scoped,
    // so a brand only ever routes to its own offices.
    const country = await this.masterData.findCountryOrFail(countryCode);

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
      country,
      office,
      routedToEmail: office.email,
      slaDueAt,
    };
  }
}
