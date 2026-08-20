import type { WorkingCalendar } from '../../common/utils/business-hours.util';
import type { CraneApplicationStatus } from './entities/crane-application.entity';

/** Veltrixair Industries. Every row these two folders write belongs to it. */
export const SITE_CODE = 102;

export const REFERENCE_PREFIX = 'VTX-HR';
export const REFERENCE_SEQUENCE = 'crane_application_ref_seq';

/**
 * KSA working week — Sunday to Thursday.
 *
 * The careers page states its promises in working days, so they have to be
 * counted the way Riyadh counts them: an application submitted on Thursday
 * afternoon is not due for screening on Saturday.
 */
export const KSA_CALENDAR: WorkingCalendar = {
  timezone: 'Asia/Riyadh',
  workingDays: [0, 1, 2, 3, 4],
  workStartHour: 8,
  workEndHour: 17,
};

/**
 * "Profile retention: 12 months under PDPL", as published.
 *
 * Held here rather than left to the files module, because it applies to the
 * whole record — the answers as well as any CV attached later.
 */
export const RETENTION_MONTHS = 12;

/** "A reference number will be issued within 1 hour." */
export const ACKNOWLEDGEMENT_HOURS = 1;

/**
 * The five-stage timeline the page publishes, in WORKING DAYS from submission.
 *
 * Note these are cumulative from the submission, not from the previous stage —
 * that is how the page reads them ("Technical interview: within 2 weeks"), and
 * measuring each stage from its own start would let a slow screening quietly
 * push the final interview past the date a candidate was given.
 *
 * The terminal stages carry no deadline: an offer is made or it is not, and
 * nobody is waiting on a clock after a rejection.
 */
export const STAGE_SLA_WORKING_DAYS: Partial<
  Record<CraneApplicationStatus, number>
> = {
  SCREENING: 5,
  TECHNICAL_INTERVIEW: 10,
  FINAL_INTERVIEW: 15,
  OFFER: 20,
};

/**
 * How many certificates one application may carry.
 *
 * Enforced here rather than by the join table: a composite key can stop the
 * same file being attached twice, but it cannot count — and a trigger for a
 * product rule is somewhere nobody looks when it becomes five.
 */
export const MAX_CERTIFICATES = 4;

/** Reply-to on the acknowledgement, and where senior enquiries go. */
export const CAREERS_INBOX = 'careers@veltrixair.com';
