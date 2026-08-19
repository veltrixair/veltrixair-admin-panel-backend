/**
 * Section 04 of the quote form: six questionnaires, one per service line.
 *
 * Only one applies to any submission, so the answers live in a single `jsonb`
 * column rather than twenty mostly-NULL columns and twenty master tables
 * nobody filters on. The database therefore cannot police what goes in — this
 * file is what does instead. A key that is not listed, a value that is not
 * listed, or an answer belonging to a different service line is a 400.
 *
 * The upside of keeping it here rather than in the schema: adding a seventh
 * service line is a change to this file, not a migration plus four tables.
 */

export const SERVICE_LINE = {
  INSTALLATION: 101,
  SELF_STANDING: 102,
  DISMANTLING: 103,
  SITE_REMOVAL: 104,
  INSPECTION: 105,
  EMERGENCY: 106,
  STRATEGIC: 107,
} as const;

export const URGENCY = {
  EMERGENCY_STOPPED: 101,
  URGENT_7_DAYS: 102,
  STANDARD_1_3_MONTHS: 103,
  STRATEGIC_3_PLUS: 104,
} as const;

/** A free-text answer rather than a fixed choice. */
const TEXT = 'TEXT' as const;

type Question = { values: readonly string[] | typeof TEXT; required: boolean };

export const SCOPE_SCHEMAS: Record<number, Record<string, Question>> = {
  // VTX-CRN-01 — Installation
  [SERVICE_LINE.INSTALLATION]: {
    projectType: {
      values: ['NEW_BUILD', 'REPLACEMENT', 'CAPACITY_EXPANSION', 'RELOCATION'],
      required: true,
    },
    buildingStatus: {
      values: [
        'READY',
        'NEEDS_PREP',
        'UNDER_CONSTRUCTION',
        'SELF_STANDING_REQUIRED',
        'TBD',
      ],
      required: true,
    },
    craneConfiguration: {
      values: ['SINGLE', 'MULTI_ONE_RUNWAY', 'MULTI_MULTI_BAY', 'TANDEM'],
      required: true,
    },
  },

  // VTX-CRN-02 — Self-standing structure
  [SERVICE_LINE.SELF_STANDING]: {
    siteType: {
      values: [
        'GREENFIELD',
        'OUTDOOR_YARD',
        'INSIDE_EXISTING',
        'PORT_MARINE',
        'PHASED_CONSTRUCTION',
      ],
      required: true,
    },
    geotechnicalReport: {
      values: ['FULL', 'PARTIAL', 'COMMISSION_FOR_US', 'UNKNOWN'],
      required: true,
    },
    availableFootprint: { values: TEXT, required: false },
    permanence: {
      values: ['PERMANENT', 'RELOCATABLE', 'TBD'],
      required: true,
    },
  },

  // VTX-CRN-03 — Dismantling
  [SERVICE_LINE.DISMANTLING]: {
    reason: {
      values: [
        'END_OF_LIFE',
        'CAPACITY_UPGRADE',
        'PLANT_RELOCATION',
        'DAMAGE',
        'FULL_DECOMMISSION',
        'MODERNISATION',
      ],
      required: true,
    },
    // Pre-2000 equipment routinely carries PCBs, asbestos or lead paint, and
    // the answer changes the survey, the crew and the disposal route.
    hazmatSuspected: {
      values: ['KNOWN', 'SUSPECTED_PRE_2000', 'NO', 'UNKNOWN'],
      required: true,
    },
    assetDisposition: {
      values: [
        'REFURB_MARKET',
        'SCRAP_RECOVERY',
        'COMPONENT_SALVAGE',
        'STORAGE',
        'ADVISORY',
      ],
      required: true,
    },
    documentation: {
      values: ['FULL', 'PARTIAL', 'MINIMAL', 'NONE'],
      required: true,
    },
  },

  // VTX-CRN-04 — Site clearance and structure removal
  [SERVICE_LINE.SITE_REMOVAL]: {
    removalScope: {
      values: [
        'SINGLE_STRUCTURE',
        'MULTI_CRANE_PLANT',
        'FULL_FACILITY',
        'PHASED_LIVE_OPS',
      ],
      required: true,
    },
    foundationBreakout: {
      values: ['FULL', 'ANCHOR_BOLTS_FLUSH', 'LEAVE_INTACT', 'TBD'],
      required: true,
    },
    restorationSpec: {
      values: ['SITE_FLUSH', 'FULL_SPEC', 'BASIC', 'REDEVELOPMENT_READY'],
      required: true,
    },
    liveOperationsAdjacent: {
      values: ['NO', 'ISOLATED_ENVELOPE', 'YES_RUNNING'],
      required: true,
    },
  },

  // VTX-CRN-06 — Statutory inspection and load testing
  [SERVICE_LINE.INSPECTION]: {
    inspectionType: {
      values: [
        'ANNUAL_SASO',
        'BIENNIAL_ISO_9927',
        'LOAD_TEST',
        'POST_INCIDENT',
        'PRE_PURCHASE',
        'PRE_INSURANCE',
        'COMMISSIONING',
      ],
      required: true,
    },
    engagementReason: {
      values: [
        'ROUTINE_CYCLE',
        'LAPSED_COMPLIANCE',
        'POST_INCIDENT',
        'ACQUISITION_DD',
        'INSURER_REQUIREMENT',
        'REGULATOR_REQUEST',
      ],
      required: true,
    },
    lastInspectionDate: { values: TEXT, required: false },
    craneCountForInspection: { values: TEXT, required: false },
  },

  // VTX-CRN-09 — 24/7 breakdown response
  [SERVICE_LINE.EMERGENCY]: {
    // Promoted OUT of the JSON into a real `priority` column as well, because
    // the pipeline is sorted by it. Kept here so the questionnaire reads whole.
    craneDownNow: {
      values: [
        'NO_PREVENTIVE',
        'P1_PRODUCTION_STOP',
        'P2_DEGRADATION',
        'P3_ADVISORY',
      ],
      required: true,
    },
    engagementPurpose: {
      values: [
        'ACTIVE_EMERGENCY',
        'ADD_COVERAGE',
        'STANDALONE_CONTRACT',
        'PRE_POSITION_CREW',
        'FLEET_PROGRAMME',
      ],
      required: true,
    },
    faultDescription: { values: TEXT, required: false },
  },

  // Multiple services / strategic discussion
  [SERVICE_LINE.STRATEGIC]: {
    strategicContext: { values: TEXT, required: false },
  },
};

export type QuotePriority = 'P1' | 'P2' | 'P3' | 'P4';

/**
 * Working out how urgent this actually is.
 *
 * There are two urgency signals on the form and they do not agree, so the
 * order matters:
 *
 *  - "Engagement Urgency" is asked of EVERYONE.
 *  - "Crane Down Right Now?" only appears if they picked breakdown response.
 *
 * Someone can therefore choose *Installation* + *Emergency — production
 * stopped* and never see the P1 question at all. Keying off the P1 answer
 * alone would triage that as routine, so urgency is the primary signal and the
 * breakdown answer only sharpens it.
 */
export function derivePriority(
  urgencyCode: number,
  scopeDetail: Record<string, unknown> | null,
): QuotePriority {
  const craneDown = scopeDetail?.craneDownNow;

  if (craneDown === 'P1_PRODUCTION_STOP') return 'P1';
  if (urgencyCode === URGENCY.EMERGENCY_STOPPED) return 'P1';
  if (craneDown === 'P2_DEGRADATION') return 'P2';
  if (urgencyCode === URGENCY.URGENT_7_DAYS) return 'P2';
  if (craneDown === 'P3_ADVISORY') return 'P3';
  if (urgencyCode === URGENCY.STANDARD_1_3_MONTHS) return 'P3';
  return 'P4';
}

/**
 * The response-time promises printed on the page, in working days.
 *
 * P1 collapses them all to zero: a production stop is not a queue item, and
 * the response tells the customer to call the hotline rather than wait.
 */
export const SLA_WORKING_DAYS: Record<
  QuotePriority,
  { triage: number; siteVisit: number; proposal: number }
> = {
  P1: { triage: 0, siteVisit: 0, proposal: 2 },
  P2: { triage: 0, siteVisit: 2, proposal: 5 },
  P3: { triage: 1, siteVisit: 5, proposal: 10 },
  P4: { triage: 1, siteVisit: 5, proposal: 10 },
};

/** Printed beside the form: "A reference number will be issued within 1 hour". */
export const HOTLINE = '+966 598 872 426';
export const QUOTES_INBOX = 'cranes@veltrixair.com';
