import { JobPosting } from '../entities/job-posting.entity';
import type { WorkMode } from '../entities/job-posting.entity';
import { describeFields } from '../../applications/application-fields.constants';
import {
  toDescriptionBlocks,
  type DescriptionBlock,
} from '../markdown-blocks.util';

/**
 * Public response shapes for the careers endpoints.
 *
 * The entities are deliberately not returned directly: they carry soft-delete
 * flags, internal ordering and audit timestamps that have no business on a
 * public page, and every nested master would drag nine columns along with it.
 */

export interface TaxonomyRef {
  code: number;
  name: string;
  slug: string;
}

export interface JobListItem {
  id: string;
  refCode: string;
  slug: string;
  title: string;
  /** Which careers page this role belongs on. */
  category: TaxonomyRef | null;
  practice: TaxonomyRef | null;
  locations: TaxonomyRef[];
  /** Empty when the role shows its city chips alone. */
  locationLabel: string;
  workMode: WorkMode;
  employmentType: string;
  experienceLabel: string;
  postedAt: Date | null;
}

export interface JobOffice {
  code: number;
  name: string;
  city: string;
  country: string;
  address: string;
  timezone: string;
  workingDays: number[];
  hours: string;
}

export interface JobApplyRoute {
  method: 'EMAIL';
  email: string;
  subjectLine: string;
  instructions: string;
}

export interface JobDetail extends JobListItem {
  /**
   * The whole advert, as the typed blocks the careers site renders.
   *
   * Summary, responsibilities and requirements used to be separate fields;
   * they are sections of one markdown document now. It is stored as markdown
   * — that is what the admin form writes — and converted on the way out, so
   * the page needs no parser of its own. See markdown-blocks.util.ts.
   *
   * Empty rather than null when a posting has no advert yet: the page maps
   * over this, and an empty list renders nothing without a guard.
   */
  description: DescriptionBlock[];
  office: JobOffice | null;
  experience: { label: string };
  seo: { title: string | null; description: string | null };
  closesAt: Date | null;
  /** How a candidate applies. The site has no form — applications go by email. */
  apply: JobApplyRoute;
  /** True when the content team has not yet authored the long-form copy. */
  contentPending: boolean;
  /**
   * Which questions this role asks, in the order the form shows them.
   *
   * Served from the same configuration the server validates against, so the
   * page and the check cannot drift: a field missing from here will be
   * refused if submitted anyway.
   */
  applicationFields: {
    key: string;
    label: string;
    required: boolean;
  }[];
}

/** Applications are routed here; the careers page publishes this address. */
export const CAREERS_APPLY_EMAIL = 'careers@veltrixair.com';

export interface WorkModeOption {
  value: WorkMode;
  label: string;
}

/**
 * Work-mode filter chips. Defined here rather than as a master table because
 * work_mode is a CHECK-constrained column, not a foreign key — and keeping the
 * list in the careers module avoids master-data having to know about careers.
 */
export const WORK_MODE_OPTIONS: WorkModeOption[] = [
  { value: 'ONSITE', label: 'On-site' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'REMOTE', label: 'Remote' },
];

const pad = (n: number) => String(n).padStart(2, '0');

export function toJobListItem(job: JobPosting): JobListItem {
  return {
    id: job.id,
    refCode: job.refCode,
    slug: job.slug,
    title: job.title,
    category: job.category
      ? {
          code: job.category.categoryCode,
          name: job.category.categoryName,
          slug: job.category.slug,
        }
      : null,
    practice: job.practice
      ? {
          code: job.practice.practiceCode,
          name: job.practice.practiceName,
          slug: job.practice.slug,
        }
      : null,
    locations: (job.locations ?? []).map((l) => ({
      code: l.locationCode,
      name: l.locationName,
      slug: l.slug,
    })),
    locationLabel: job.locationLabel ?? '',
    workMode: job.workMode,
    employmentType: job.employmentType,
    experienceLabel: job.experienceLabel,
    postedAt: job.postedAt,
  };
}

export function toJobDetail(job: JobPosting): JobDetail {
  // One field to judge now, where there used to be three.
  const hasContent = !!job.descriptionMdx?.trim();

  return {
    ...toJobListItem(job),
    description: toDescriptionBlocks(job.descriptionMdx),
    office: job.office
      ? {
          code: job.office.officeCode,
          name: job.office.officeName,
          city: job.office.city,
          country: job.office.countryName,
          address: job.office.address,
          timezone: job.office.timezone,
          workingDays: job.office.workingDays,
          hours: `${pad(job.office.workStartHour)}:00–${pad(job.office.workEndHour)}:00`,
        }
      : null,
    experience: { label: job.experienceLabel },
    applicationFields: describeFields(job.applicationFields),
    seo: {
      title: job.seoTitle ?? job.title,
      description: job.seoDescription,
    },
    closesAt: job.closesAt,
    apply: {
      method: 'EMAIL',
      email: CAREERS_APPLY_EMAIL,
      subjectLine: `${job.refCode} — ${job.title}`,
      instructions:
        'Email your CV, a GitHub or portfolio link, and a short paragraph about an engagement you are proud of.',
    },
    contentPending: !hasContent,
  };
}
