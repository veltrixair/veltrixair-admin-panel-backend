import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationSourceMaster } from './entities/application-source-master.entity';
import { ArticleTopicMaster } from './entities/article-topic-master.entity';
import { ArticleTypeMaster } from './entities/article-type-master.entity';
import { Architect } from '../discovery/entities/architect.entity';
import { CountryMaster } from './entities/country-master.entity';
import { NoticePeriodMaster } from './entities/notice-period-master.entity';
import { QualificationMaster } from './entities/qualification-master.entity';
import { WorkAuthorisationMaster } from './entities/work-authorisation-master.entity';
import { DiscoveryPracticeMaster } from './entities/discovery-practice-master.entity';
import { RegionMaster } from './entities/region-master.entity';
import { EnquiryTimelineMaster } from './entities/enquiry-timeline-master.entity';
import { EnquiryTopicMaster } from './entities/enquiry-topic-master.entity';
import { IndustryMaster } from './entities/industry-master.entity';
import { JobLocationMaster } from './entities/job-location-master.entity';
import { OfficeMaster } from './entities/office-master.entity';
import { PracticeAreaMaster } from './entities/practice-area-master.entity';

export interface FormOption {
  code: number;
  label: string;
}

/**
 * Careers filter chips. Carries a slug because it appears in the query string,
 * and uses `name` rather than `label` so it matches the taxonomy shape returned
 * by the job endpoints — one concept, one shape.
 */
export interface FilterOption {
  code: number;
  name: string;
  slug: string;
}

export interface ContactFormOptions {
  topics: FormOption[];
  countries: FormOption[];
  industries: FormOption[];
  timelines: FormOption[];
}

export interface CareerFilterOptions {
  practices: FilterOption[];
  locations: FilterOption[];
}

/** Every dropdown on the job application form. */
export interface ApplyFormOptions {
  qualifications: FormOption[];
  noticePeriods: FormOption[];
  workAuthorisations: FormOption[];
  sources: FormOption[];
  countries: FormOption[];
}

/** Type chips are colour-coded on the insights page. */
export interface TypeFilterOption extends FilterOption {
  colourHex: string | null;
}

export interface InsightFilterOptions {
  types: TypeFilterOption[];
  topics: FilterOption[];
  regions: FilterOption[];
}

/** "Pick a practice" on the discovery page, with the architect you would meet. */
export interface DiscoveryPracticeOption extends FilterOption {
  architect: {
    /** Falls back to the display title while the practitioner is unnamed. */
    name: string;
    credentials: string | null;
    /** True while the real practitioner has not been recorded. */
    profilePending: boolean;
  } | null;
}

@Injectable()
export class MasterDataService {
  constructor(
    @InjectRepository(EnquiryTopicMaster)
    private readonly topicRepo: Repository<EnquiryTopicMaster>,
    @InjectRepository(CountryMaster)
    private readonly countryRepo: Repository<CountryMaster>,
    @InjectRepository(IndustryMaster)
    private readonly industryRepo: Repository<IndustryMaster>,
    @InjectRepository(EnquiryTimelineMaster)
    private readonly timelineRepo: Repository<EnquiryTimelineMaster>,
    @InjectRepository(OfficeMaster)
    private readonly officeRepo: Repository<OfficeMaster>,
    @InjectRepository(PracticeAreaMaster)
    private readonly practiceRepo: Repository<PracticeAreaMaster>,
    @InjectRepository(JobLocationMaster)
    private readonly jobLocationRepo: Repository<JobLocationMaster>,
    @InjectRepository(ArticleTypeMaster)
    private readonly articleTypeRepo: Repository<ArticleTypeMaster>,
    @InjectRepository(ArticleTopicMaster)
    private readonly articleTopicRepo: Repository<ArticleTopicMaster>,
    @InjectRepository(RegionMaster)
    private readonly regionRepo: Repository<RegionMaster>,
    @InjectRepository(DiscoveryPracticeMaster)
    private readonly discoveryPracticeRepo: Repository<DiscoveryPracticeMaster>,
    @InjectRepository(Architect)
    private readonly architectRepo: Repository<Architect>,
    @InjectRepository(QualificationMaster)
    private readonly qualificationRepo: Repository<QualificationMaster>,
    @InjectRepository(NoticePeriodMaster)
    private readonly noticePeriodRepo: Repository<NoticePeriodMaster>,
    @InjectRepository(WorkAuthorisationMaster)
    private readonly workAuthRepo: Repository<WorkAuthorisationMaster>,
    @InjectRepository(ApplicationSourceMaster)
    private readonly applicationSourceRepo: Repository<ApplicationSourceMaster>,
  ) {}

  async getDiscoveryPractices(
    siteCode: number,
  ): Promise<DiscoveryPracticeOption[]> {
    const [practices, architects] = await Promise.all([
      this.discoveryPracticeRepo.find({
        where: { isActive: true, isDeleted: false, siteCode },
        order: { displayOrder: 'ASC' },
      }),
      this.architectRepo.find({
        where: { isActive: true, isDeleted: false, siteCode },
        relations: { practices: true },
      }),
    ]);

    return practices.map((p) => {
      // An architect may cover several practices, so match against the set.
      const architect = architects.find((a) =>
        (a.practices ?? []).some((ap) => ap.practiceCode === p.practiceCode),
      );
      return {
        code: p.practiceCode,
        name: p.practiceName,
        slug: p.slug,
        architect: architect
          ? {
              name: architect.fullName ?? architect.displayTitle,
              credentials: architect.credentials,
              profilePending: !architect.fullName,
            }
          : null,
      };
    });
  }

  /** The three filter rows on /insights/. */
  async getInsightFilterOptions(
    siteCode: number,
  ): Promise<InsightFilterOptions> {
    const active = { isActive: true, isDeleted: false, siteCode };
    const order = { displayOrder: 'ASC' as const };

    const [types, topics, regions] = await Promise.all([
      this.articleTypeRepo.find({ where: active, order }),
      this.articleTopicRepo.find({ where: active, order }),
      this.regionRepo.find({ where: active, order }),
    ]);

    return {
      types: types.map((t) => ({
        code: t.typeCode,
        name: t.typeName,
        slug: t.slug,
        colourHex: t.colourHex,
      })),
      topics: topics.map((t) => ({
        code: t.topicCode,
        name: t.topicName,
        slug: t.slug,
      })),
      regions: regions.map((r) => ({
        code: r.regionCode,
        name: r.regionName,
        slug: r.slug,
      })),
    };
  }

  /** Filter chip values for /careers/. */
  async getCareerFilterOptions(siteCode: number): Promise<CareerFilterOptions> {
    const [practices, locations] = await Promise.all([
      this.practiceRepo.find({
        where: { isActive: true, isDeleted: false, siteCode },
        order: { displayOrder: 'ASC' },
      }),
      this.jobLocationRepo.find({
        where: { isActive: true, isDeleted: false, siteCode },
        order: { displayOrder: 'ASC' },
      }),
    ]);

    return {
      practices: practices.map((p) => ({
        code: p.practiceCode,
        name: p.practiceName,
        slug: p.slug,
      })),
      locations: locations.map((l) => ({
        code: l.locationCode,
        name: l.locationName,
        slug: l.slug,
      })),
    };
  }

  /**
   * Every dropdown on the contact form in a single response, so the frontend
   * never hardcodes option lists that can drift out of sync with the database.
   */
  async getContactFormOptions(siteCode: number): Promise<ContactFormOptions> {
    const [topics, countries, industries, timelines] = await Promise.all([
      this.topicRepo.find({
        where: { isActive: true, isDeleted: false, siteCode },
        order: { displayOrder: 'ASC' },
      }),
      this.countryRepo.find({
        where: { isActive: true, isDeleted: false },
        order: { displayOrder: 'ASC' },
      }),
      this.industryRepo.find({
        where: { isActive: true, isDeleted: false, siteCode },
        order: { displayOrder: 'ASC' },
      }),
      this.timelineRepo.find({
        where: { isActive: true, isDeleted: false },
        order: { displayOrder: 'ASC' },
      }),
    ]);

    return {
      topics: topics.map((t) => ({ code: t.topicCode, label: t.topicName })),
      countries: countries.map((c) => ({
        code: c.countryCode,
        label: c.countryName,
      })),
      industries: industries.map((i) => ({
        code: i.industryCode,
        label: i.industryName,
      })),
      timelines: timelines.map((t) => ({
        code: t.timelineCode,
        label: t.timelineName,
      })),
    };
  }

  /**
   * Every dropdown on the job application form.
   *
   * Takes no site, and that is deliberate rather than an oversight: every list
   * here — qualifications, notice periods, work authorisations, sources,
   * countries — is shared across all three brands. A Master's degree is a
   * Master's degree whichever business is hiring. If one of these ever needs to
   * differ per brand, it gains a `site_code` and this method gains a parameter.
   */
  async getApplyFormOptions(): Promise<ApplyFormOptions> {
    const live = {
      where: { isActive: true, isDeleted: false },
      order: { displayOrder: 'ASC' as const },
    };

    const [
      qualifications,
      noticePeriods,
      workAuthorisations,
      sources,
      countries,
    ] = await Promise.all([
      this.qualificationRepo.find(live),
      this.noticePeriodRepo.find(live),
      this.workAuthRepo.find(live),
      this.applicationSourceRepo.find(live),
      this.countryRepo.find(live),
    ]);

    return {
      qualifications: qualifications.map((q) => ({
        code: q.qualificationCode,
        label: q.qualificationName,
      })),
      noticePeriods: noticePeriods.map((n) => ({
        code: n.noticePeriodCode,
        label: n.noticePeriodName,
      })),
      workAuthorisations: workAuthorisations.map((w) => ({
        code: w.workAuthorisationCode,
        label: w.workAuthorisationName,
      })),
      sources: sources.map((s) => ({
        code: s.sourceCode,
        label: s.sourceName,
      })),
      countries: countries.map((c) => ({
        code: c.countryCode,
        label: c.countryName,
      })),
    };
  }

  /**
   * Validates every coded field on an application in one round trip, so a form
   * with three bad codes reports all three rather than one at a time.
   */
  /**
   * Every code is optional now: a posting can switch its question off, and
   * an absent answer is nothing to validate. Only codes that were actually
   * given are looked up — whether one SHOULD have been given is the
   * posting field config’s business, checked before this runs.
   */
  async assertApplicationCodes(codes: {
    qualificationCode?: number | null;
    noticePeriodCode?: number | null;
    workAuthorisationCode?: number | null;
    sourceCode?: number | null;
    countryCode?: number | null;
  }): Promise<void> {
    const live = { isActive: true, isDeleted: false };

    const [qualification, noticePeriod, workAuth, source, country] =
      await Promise.all([
        codes.qualificationCode
          ? this.qualificationRepo.findOne({
              where: { qualificationCode: codes.qualificationCode, ...live },
            })
          : Promise.resolve(true),
        codes.noticePeriodCode
          ? this.noticePeriodRepo.findOne({
              where: { noticePeriodCode: codes.noticePeriodCode, ...live },
            })
          : Promise.resolve(true),
        codes.workAuthorisationCode
          ? this.workAuthRepo.findOne({
              where: {
                workAuthorisationCode: codes.workAuthorisationCode,
                ...live,
              },
            })
          : Promise.resolve(true),
        codes.sourceCode
          ? this.applicationSourceRepo.findOne({
              where: { sourceCode: codes.sourceCode, ...live },
            })
          : Promise.resolve(true),
        codes.countryCode
          ? this.countryRepo.findOne({
              where: { countryCode: codes.countryCode, ...live },
            })
          : Promise.resolve(true),
      ]);

    const unknown: string[] = [];
    if (!qualification)
      unknown.push(`qualificationCode ${codes.qualificationCode}`);
    if (!noticePeriod)
      unknown.push(`noticePeriodCode ${codes.noticePeriodCode}`);
    if (!workAuth)
      unknown.push(`workAuthorisationCode ${codes.workAuthorisationCode}`);
    if (!source) unknown.push(`sourceCode ${codes.sourceCode}`);
    if (!country) unknown.push(`countryCode ${codes.countryCode}`);

    if (unknown.length > 0) {
      throw new NotFoundException(`Unknown or inactive: ${unknown.join(', ')}`);
    }
  }

  /**
   * Topics are per-brand, so the brand is part of the lookup rather than
   * something checked afterwards. A code belonging to another site is "unknown"
   * here, which is the honest answer — from that site's form it does not exist.
   */
  async findTopicOrFail(
    topicCode: number,
    siteCode: number,
  ): Promise<EnquiryTopicMaster> {
    const topic = await this.topicRepo.findOne({
      where: { topicCode, siteCode, isActive: true, isDeleted: false },
    });
    if (!topic) {
      throw new NotFoundException(`Unknown enquiry topic: ${topicCode}`);
    }
    return topic;
  }

  async findCountryOrFail(countryCode: number): Promise<CountryMaster> {
    const country = await this.countryRepo.findOne({
      where: { countryCode, isActive: true, isDeleted: false },
    });
    if (!country) {
      throw new NotFoundException(`Unknown country: ${countryCode}`);
    }
    return country;
  }

  async findOfficeOrFail(
    officeCode: number,
    siteCode: number,
  ): Promise<OfficeMaster> {
    const office = await this.officeRepo.findOne({
      where: { officeCode, siteCode, isActive: true, isDeleted: false },
    });
    if (!office) {
      throw new NotFoundException(`Unknown office: ${officeCode}`);
    }
    return office;
  }

  listOffices(): Promise<OfficeMaster[]> {
    return this.officeRepo.find({
      where: { isActive: true, isDeleted: false },
      order: { displayOrder: 'ASC' },
    });
  }
}
