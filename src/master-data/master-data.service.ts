import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationSourceMaster } from './entities/application-source-master.entity';
import { ArticleTopicMaster } from './entities/article-topic-master.entity';
import { ArticleTypeMaster } from './entities/article-type-master.entity';
import { Architect } from '../discovery/entities/architect.entity';
import { CountryMaster } from './entities/country-master.entity';
import { ExperienceBandMaster } from './entities/experience-band-master.entity';
import { NoticePeriodMaster } from './entities/notice-period-master.entity';
import { QualificationMaster } from './entities/qualification-master.entity';
import { WorkAuthorisationMaster } from './entities/work-authorisation-master.entity';
import { DiscoveryPracticeMaster } from './entities/discovery-practice-master.entity';
import { RegionMaster } from './entities/region-master.entity';
import { EnquiryTimelineMaster } from './entities/enquiry-timeline-master.entity';
import { IndustryMaster } from './entities/industry-master.entity';
import { JobCategoryMaster } from './entities/job-category-master.entity';
import { JobLocationMaster } from './entities/job-location-master.entity';
import { OfficeMaster } from './entities/office-master.entity';
import { KnodeBedBandMaster } from './entities/knode-bed-band-master.entity';
import { KnodeCallWindowMaster } from './entities/knode-call-window-master.entity';
import { KnodeContactRoleMaster } from './entities/knode-contact-role-master.entity';
import { KnodeFacilityTypeMaster } from './entities/knode-facility-type-master.entity';
import { KnodeModuleMaster } from './entities/knode-module-master.entity';
import { KnodeOpdBandMaster } from './entities/knode-opd-band-master.entity';
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
  countries: FormOption[];
  industries: FormOption[];
  timelines: FormOption[];
}

/** A kNODE product, with enough for the form to know what it can offer. */
export interface KnodeModuleOption {
  code: number;
  name: string;
  audience: string;
  availability: string;
  /**
   * Whether it has shipped. The form uses this to decide whether picking it
   * means "show me" or "tell me when" — and the backend decides the same thing
   * again on submission, because a browser is not where that call belongs.
   */
  isLive: boolean;
}

/** Every dropdown on the Book a demo form. */
export interface KnodeDemoOptions {
  modules: KnodeModuleOption[];
  facilityTypes: FormOption[];
  bedBands: FormOption[];
  opdBands: FormOption[];
  roles: FormOption[];
  callWindows: FormOption[];
}

export interface CareerFilterOptions {
  /**
   * Which careers page a posting belongs on — Internship, Coach, Experienced.
   * The slug is what the pages send as ?category=, and the code is what the
   * admin job form has to supply: categoryCode is required on create.
   */
  categories: FilterOption[];
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
  /** Every band, for the "Total experience" dropdown. */
  experienceBands: FormOption[];
  /**
   * The same list with Fresher removed, for "Relevant experience".
   *
   * Returned as its own array rather than leaving the form to filter a flag:
   * the browser deciding which options are legal is how a dropdown drifts out
   * of step with what the server will accept.
   */
  relevantExperienceBands: FormOption[];
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

@Injectable()
export class MasterDataService {
  constructor(
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
    @InjectRepository(JobCategoryMaster)
    private readonly jobCategoryRepo: Repository<JobCategoryMaster>,
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
    @InjectRepository(ExperienceBandMaster)
    private readonly experienceBandRepo: Repository<ExperienceBandMaster>,
    @InjectRepository(NoticePeriodMaster)
    private readonly noticePeriodRepo: Repository<NoticePeriodMaster>,
    @InjectRepository(WorkAuthorisationMaster)
    private readonly workAuthRepo: Repository<WorkAuthorisationMaster>,
    @InjectRepository(ApplicationSourceMaster)
    private readonly applicationSourceRepo: Repository<ApplicationSourceMaster>,
    @InjectRepository(KnodeModuleMaster)
    private readonly knodeModuleRepo: Repository<KnodeModuleMaster>,
    @InjectRepository(KnodeFacilityTypeMaster)
    private readonly knodeFacilityTypeRepo: Repository<KnodeFacilityTypeMaster>,
    @InjectRepository(KnodeBedBandMaster)
    private readonly knodeBedBandRepo: Repository<KnodeBedBandMaster>,
    @InjectRepository(KnodeOpdBandMaster)
    private readonly knodeOpdBandRepo: Repository<KnodeOpdBandMaster>,
    @InjectRepository(KnodeContactRoleMaster)
    private readonly knodeContactRoleRepo: Repository<KnodeContactRoleMaster>,
    @InjectRepository(KnodeCallWindowMaster)
    private readonly knodeCallWindowRepo: Repository<KnodeCallWindowMaster>,
  ) {}

  /** The three filter rows on /insights/. */
  async getInsightFilterOptions(
    siteCode: number,
  ): Promise<InsightFilterOptions> {
    const active = { isActive: true, isDeleted: false, siteCode };
    /*
     * Regions are not site-scoped, and `region_masters` has no `site_code`
     * column to scope them by — "KSA" is the same territory whichever
     * dashboard is asking. Reusing `active` here made TypeORM throw on the
     * unknown property, which rejected the whole Promise.all and took the
     * types and topics down with it.
     */
    const activeAnySite = { isActive: true, isDeleted: false };
    const order = { displayOrder: 'ASC' as const };

    const [types, topics, regions] = await Promise.all([
      this.articleTypeRepo.find({ where: active, order }),
      this.articleTopicRepo.find({ where: active, order }),
      this.regionRepo.find({ where: activeAnySite, order }),
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
    const [categories, practices, locations] = await Promise.all([
      this.jobCategoryRepo.find({
        where: { isActive: true, isDeleted: false, siteCode },
        order: { displayOrder: 'ASC' },
      }),
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
      categories: categories.map((c) => ({
        code: c.categoryCode,
        name: c.categoryName,
        slug: c.slug,
      })),
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
    const [countries, industries, timelines] = await Promise.all([
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
      experienceBands,
    ] = await Promise.all([
      this.qualificationRepo.find(live),
      this.noticePeriodRepo.find(live),
      this.workAuthRepo.find(live),
      this.applicationSourceRepo.find(live),
      this.countryRepo.find(live),
      this.experienceBandRepo.find(live),
    ]);

    const band = (b: ExperienceBandMaster) => ({
      code: b.experienceBandCode,
      label: b.experienceBandName,
    });

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
      experienceBands: experienceBands.map(band),
      relevantExperienceBands: experienceBands
        .filter((b) => b.availableForRelevant)
        .map(band),
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
  /**
   * The five coded answers on the kNODE demo form, checked before they are
   * stored.
   *
   * None of them was checked at all — the submit wrote `dto.facilityTypeCode`
   * and the rest straight onto the row. Every one of these masters is scoped
   * by site, so an unchecked code can be not merely unknown but another
   * brand's, which is how a crane industry ended up on an IT contact enquiry.
   *
   * Modules are checked by the caller, which needs the rows themselves; this
   * covers the five that are stored as bare codes.
   */
  async assertKnodeDemoCodes(
    codes: {
      facilityTypeCode?: number | null;
      bedBandCode?: number | null;
      opdBandCode?: number | null;
      contactRoleCode?: number | null;
      callWindowCode?: number | null;
    },
    siteCode: number,
  ): Promise<void> {
    const live = { isActive: true, isDeleted: false, siteCode };

    const [facilityType, bedBand, opdBand, contactRole, callWindow] =
      await Promise.all([
        codes.facilityTypeCode
          ? this.knodeFacilityTypeRepo.findOne({
              where: { facilityTypeCode: codes.facilityTypeCode, ...live },
            })
          : Promise.resolve(true),
        codes.bedBandCode
          ? this.knodeBedBandRepo.findOne({
              where: { bedBandCode: codes.bedBandCode, ...live },
            })
          : Promise.resolve(true),
        codes.opdBandCode
          ? this.knodeOpdBandRepo.findOne({
              where: { opdBandCode: codes.opdBandCode, ...live },
            })
          : Promise.resolve(true),
        codes.contactRoleCode
          ? this.knodeContactRoleRepo.findOne({
              where: { contactRoleCode: codes.contactRoleCode, ...live },
            })
          : Promise.resolve(true),
        codes.callWindowCode
          ? this.knodeCallWindowRepo.findOne({
              where: { callWindowCode: codes.callWindowCode, ...live },
            })
          : Promise.resolve(true),
      ]);

    const unknown: string[] = [];
    if (!facilityType)
      unknown.push(`facilityTypeCode ${codes.facilityTypeCode}`);
    if (!bedBand) unknown.push(`bedBandCode ${codes.bedBandCode}`);
    if (!opdBand) unknown.push(`opdBandCode ${codes.opdBandCode}`);
    if (!contactRole) unknown.push(`contactRoleCode ${codes.contactRoleCode}`);
    if (!callWindow) unknown.push(`callWindowCode ${codes.callWindowCode}`);

    if (unknown.length > 0) {
      throw new NotFoundException(`Unknown or inactive: ${unknown.join(', ')}`);
    }
  }

  /**
   * The three coded answers on the contact form, checked before they are
   * stored.
   *
   * Nothing checked them at all, and the gap is not theoretical: three live
   * IT enquiries carry `industryCode` 201, which is "Oil & Gas — Upstream"
   * on the CRANE brand. The IT options list runs 101-109, so the panel had
   * no label to show and printed the bare number.
   *
   * Industry is the only one scoped by site, and so the only one where a
   * code can be real and still wrong. Countries and timelines are shared
   * across the brands — they need to exist and be live, nothing more.
   *
   * NotFound rather than BadRequest, matching the sibling above: the code
   * is well-formed, it just names nothing this form may offer.
   */
  async assertContactCodes(
    codes: {
      countryCode?: number | null;
      industryCode?: number | null;
      timelineCode?: number | null;
    },
    siteCode: number,
  ): Promise<void> {
    const live = { isActive: true, isDeleted: false };

    const [country, industry, timeline] = await Promise.all([
      codes.countryCode
        ? this.countryRepo.findOne({
            where: { countryCode: codes.countryCode, ...live },
          })
        : Promise.resolve(true),
      codes.industryCode
        ? this.industryRepo.findOne({
            where: { industryCode: codes.industryCode, siteCode, ...live },
          })
        : Promise.resolve(true),
      codes.timelineCode
        ? this.timelineRepo.findOne({
            where: { timelineCode: codes.timelineCode, ...live },
          })
        : Promise.resolve(true),
    ]);

    const unknown: string[] = [];
    if (!country) unknown.push(`countryCode ${codes.countryCode}`);
    if (!industry) unknown.push(`industryCode ${codes.industryCode}`);
    if (!timeline) unknown.push(`timelineCode ${codes.timelineCode}`);

    if (unknown.length > 0) {
      throw new NotFoundException(`Unknown or inactive: ${unknown.join(', ')}`);
    }
  }

  async assertApplicationCodes(codes: {
    qualificationCode?: number | null;
    noticePeriodCode?: number | null;
    workAuthorisationCode?: number | null;
    sourceCode?: number | null;
  }): Promise<void> {
    const live = { isActive: true, isDeleted: false };

    const [qualification, noticePeriod, workAuth, source] = await Promise.all([
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
    ]);

    const unknown: string[] = [];
    if (!qualification)
      unknown.push(`qualificationCode ${codes.qualificationCode}`);
    if (!noticePeriod)
      unknown.push(`noticePeriodCode ${codes.noticePeriodCode}`);
    if (!workAuth)
      unknown.push(`workAuthorisationCode ${codes.workAuthorisationCode}`);
    if (!source) unknown.push(`sourceCode ${codes.sourceCode}`);

    if (unknown.length > 0) {
      throw new NotFoundException(`Unknown or inactive: ${unknown.join(', ')}`);
    }
  }

  /**
   * Validate the two experience bands and hand back the years they imply.
   *
   * Separate from assertApplicationCodes because this one has a return value.
   * The application row stores both the band the candidate chose and the band's
   * lower bound, and the bound has to come from the master rather than from a
   * table of numbers kept in the service — one source, one place to edit.
   *
   * Fresher is refused on the relevant question. "No experience at all" and
   * "none of it in this discipline" are different answers, and the second is
   * what a zero here would claim.
   */
  async resolveExperienceBands(codes: {
    experienceBandCode?: number | null;
    relevantExperienceBandCode?: number | null;
  }): Promise<{
    experienceYears: number | null;
    relevantExperienceYears: number | null;
  }> {
    const live = { isActive: true, isDeleted: false };

    const [total, relevant] = await Promise.all([
      codes.experienceBandCode
        ? this.experienceBandRepo.findOne({
            where: { experienceBandCode: codes.experienceBandCode, ...live },
          })
        : Promise.resolve(null),
      codes.relevantExperienceBandCode
        ? this.experienceBandRepo.findOne({
            where: {
              experienceBandCode: codes.relevantExperienceBandCode,
              ...live,
            },
          })
        : Promise.resolve(null),
    ]);

    const unknown: string[] = [];
    if (codes.experienceBandCode && !total)
      unknown.push(`experienceBandCode ${codes.experienceBandCode}`);
    if (codes.relevantExperienceBandCode && !relevant)
      unknown.push(
        `relevantExperienceBandCode ${codes.relevantExperienceBandCode}`,
      );

    if (unknown.length > 0) {
      throw new NotFoundException(`Unknown or inactive: ${unknown.join(', ')}`);
    }

    if (relevant && !relevant.availableForRelevant) {
      throw new BadRequestException(
        `"${relevant.experienceBandName}" is not an option for relevant experience. ` +
          'Leave it blank instead.',
      );
    }

    return {
      experienceYears: total ? total.minYears : null,
      relevantExperienceYears: relevant ? relevant.minYears : null,
    };
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
  /**
   * Every dropdown on the Book a demo form, in one response.
   *
   * Six lists the kNODE website currently hardcodes in its own bundle. Serving
   * them here is the point: two copies of a list is exactly how the crane
   * form fell out of step with its own database, and the module list in
   * particular changes every time something ships.
   */
  async getKnodeDemoOptions(siteCode: number): Promise<KnodeDemoOptions> {
    const active = { isActive: true, isDeleted: false, siteCode };
    const byOrder = { displayOrder: 'ASC' as const };

    const [modules, facilityTypes, bedBands, opdBands, roles, callWindows] =
      await Promise.all([
        this.knodeModuleRepo.find({ where: active, order: byOrder }),
        this.knodeFacilityTypeRepo.find({ where: active, order: byOrder }),
        this.knodeBedBandRepo.find({ where: active, order: byOrder }),
        this.knodeOpdBandRepo.find({ where: active, order: byOrder }),
        this.knodeContactRoleRepo.find({ where: active, order: byOrder }),
        this.knodeCallWindowRepo.find({ where: active, order: byOrder }),
      ]);

    return {
      modules: modules.map((m) => ({
        code: m.moduleCode,
        name: m.moduleName,
        audience: m.audience,
        availability: m.availability,
        isLive: m.isLive,
      })),
      facilityTypes: facilityTypes.map((f) => ({
        code: f.facilityTypeCode,
        label: f.facilityTypeLabel,
      })),
      bedBands: bedBands.map((b) => ({
        code: b.bedBandCode,
        label: b.bedBandLabel,
      })),
      opdBands: opdBands.map((o) => ({
        code: o.opdBandCode,
        label: o.opdBandLabel,
      })),
      roles: roles.map((r) => ({
        code: r.contactRoleCode,
        label: r.contactRoleLabel,
      })),
      callWindows: callWindows.map((c) => ({
        code: c.callWindowCode,
        label: c.callWindowLabel,
      })),
    };
  }
}
