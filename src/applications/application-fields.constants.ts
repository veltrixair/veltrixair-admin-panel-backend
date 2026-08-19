/**
 * Which questions a job posting asks its applicants.
 *
 * The catalogue is declared here, not in the database: a posting chooses which
 * of a KNOWN list of fields to show, it cannot invent new ones. That keeps this
 * a configuration feature rather than a form builder — no dynamic columns, no
 * schema churn, and the admin screens can still render a real field for every
 * answer.
 *
 * The same shape is served to the form and used to validate the submission, so
 * the two cannot drift: a field the recruiter switched off is not merely absent
 * from the page, it is refused by the server.
 *
 * Why this is stored at all, rather than left to the frontend: without it, a
 * null answer is ambiguous forever. Six months on, nobody can tell whether the
 * candidate skipped "Expected CTC" or the role never asked for it — and that is
 * not reconstructable after the fact.
 */

/** Always collected. Not toggleable, so never present in the config. */
export const ALWAYS_ON = [
  'firstName',
  'lastName',
  'email',
  'resume',
  'consentGiven',
] as const;

/**
 * Every toggleable question, and the DTO properties it governs.
 *
 * One entry can cover several properties — "Current location" is a city and a
 * country, "Current company & designation" is two text fields on one row of the
 * form. Switching the question off refuses all of its properties.
 */
export const APPLICATION_FIELDS = {
  phone: { label: 'Phone', properties: ['phone'] },
  currentLocation: {
    label: 'Current location',
    properties: ['city', 'countryCode'],
  },
  linkedinUrl: { label: 'LinkedIn profile', properties: ['linkedinUrl'] },
  portfolioUrl: { label: 'Portfolio / GitHub', properties: ['portfolioUrl'] },
  qualification: {
    label: 'Highest qualification',
    properties: ['qualificationCode'],
  },
  source: { label: 'How did you hear about us?', properties: ['sourceCode'] },
  currentEmployer: {
    label: 'Current company & designation',
    properties: ['currentCompany', 'currentTitle'],
  },
  totalExperience: {
    label: 'Total experience (yrs)',
    properties: ['experienceYears'],
  },
  relevantExperience: {
    label: 'Relevant experience (yrs)',
    properties: ['relevantExperienceYears'],
  },
  keySkills: { label: 'Key skills', properties: ['keySkills'] },
  currentCtc: { label: 'Current CTC', properties: ['currentCtc'] },
  expectedCtc: {
    label: 'Expected CTC',
    properties: ['expectedSalary', 'salaryCurrency'],
  },
  noticePeriod: { label: 'Notice period', properties: ['noticePeriodCode'] },
  willingToRelocate: {
    label: 'Willing to relocate?',
    properties: ['willingToRelocate'],
  },
  workAuthorisation: {
    label: 'Work authorization (KSA / UAE)',
    properties: ['workAuthorisationCode'],
  },
  coverNote: { label: 'Cover note', properties: ['coverNote'] },
} as const;

export type ApplicationFieldKey = keyof typeof APPLICATION_FIELDS;

export const APPLICATION_FIELD_KEYS = Object.keys(
  APPLICATION_FIELDS,
) as ApplicationFieldKey[];

export interface FieldSetting {
  on: boolean;
  required: boolean;
}

export type ApplicationFieldConfig = Partial<
  Record<ApplicationFieldKey, FieldSetting>
>;

/**
 * What a posting asks when it has no configuration of its own.
 *
 * Matches the form as drawn: everything on except "How did you hear about us?"
 * and work authorisation, with the four the design marks required. Postings
 * created before this feature existed fall back to this, so their behaviour
 * does not change.
 */
export const DEFAULT_APPLICATION_FIELDS: Record<
  ApplicationFieldKey,
  FieldSetting
> = {
  phone: { on: true, required: true },
  currentLocation: { on: true, required: false },
  linkedinUrl: { on: true, required: false },
  portfolioUrl: { on: true, required: false },
  qualification: { on: true, required: false },
  source: { on: false, required: false },
  currentEmployer: { on: true, required: false },
  totalExperience: { on: true, required: true },
  relevantExperience: { on: true, required: false },
  keySkills: { on: true, required: false },
  currentCtc: { on: true, required: false },
  expectedCtc: { on: true, required: true },
  noticePeriod: { on: true, required: true },
  willingToRelocate: { on: true, required: false },
  workAuthorisation: { on: false, required: false },
  coverNote: { on: true, required: false },
};

/** A posting's stored config merged over the defaults. */
export function resolveFields(
  stored: ApplicationFieldConfig | null,
): Record<ApplicationFieldKey, FieldSetting> {
  if (!stored) return { ...DEFAULT_APPLICATION_FIELDS };

  const resolved = { ...DEFAULT_APPLICATION_FIELDS };
  for (const key of APPLICATION_FIELD_KEYS) {
    const setting = stored[key];
    if (setting) {
      // A field that is off cannot also be required — the combination would
      // reject every submission, so `on` wins rather than the posting becoming
      // unapplicable.
      resolved[key] = {
        on: setting.on,
        required: setting.on && setting.required,
      };
    }
  }
  return resolved;
}

/** What the apply form renders from — the label and state of each question. */
export function describeFields(
  stored: ApplicationFieldConfig | null,
): { key: ApplicationFieldKey; label: string; required: boolean }[] {
  const resolved = resolveFields(stored);
  return APPLICATION_FIELD_KEYS.filter((key) => resolved[key].on).map(
    (key) => ({
      key,
      label: APPLICATION_FIELDS[key].label,
      required: resolved[key].required,
    }),
  );
}
