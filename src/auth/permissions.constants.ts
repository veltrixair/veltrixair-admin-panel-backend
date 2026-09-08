/**
 * The authorization vocabulary.
 *
 * Feature codes run 101–199 for staff-facing areas; 201–299 is reserved for a
 * client portal, so adding a second subject type later needs no renumbering.
 */

export const PERMISSIONS_KEY = 'requiredPermission';

/** Set by @SiteScope on controllers for features only one brand has. */
export const SITE_SCOPE_KEY = 'requiredSiteScope';

export type RequiredPermission = [featureCode: number, permissionCode: number];

export const FEATURE = {
  IT_CONTACT: 101,
  IT_CAREERS: 102,
  INSIGHTS: 103,
  IT_DISCOVERY: 104,
  FILES: 105,
  ADMINS: 106,
  IT_APPLICATIONS: 107,
  /** Site-specific: the crane business's quote pipeline. */
  CRANE_QUOTES: 108,
  /** Site-specific: engineer visit requests for the crane business. */
  CRANE_SITE_VISITS: 109,

  /** Contact enquiries for the data privacy practice. */
  PRIVACY_ENQUIRIES: 110,

  /** Crane job adverts. */
  CRANE_CAREERS: 111,

  /**
   * Crane candidates. Separate from the adverts because these records
   * carry nationality and KSA residency status, so publishing a vacancy
   * and reading applicants must be grantable independently.
   */
  CRANE_APPLICATIONS: 112,

  /**
   * Employee records, onboarding documents and payslips.
   *
   * Deliberately not folded into ADMINS. Administering accounts and reading
   * somebody's payslip are different powers: an IT admin who can create logins
   * has no business in a colleague's salary, and HR needs the personnel file
   * without administering anything at all. Granted to Super Admin and HR
   * Manager, and to nobody else.
   */
  HR: 113,
} as const;

export const PERMISSION = {
  VIEW: 101,
  CREATE: 102,
  UPDATE: 103,
  DELETE: 104,
} as const;

export const ROLE = {
  SUPER_ADMIN: 101,
  CONTENT_EDITOR: 102,
  RECRUITER: 103,
  SALES: 104,
  VIEWER: 105,
  /** Created, awaiting a role. Grants nothing — see the StaffOnboarding migration. */
  PENDING: 106,
} as const;

/**
 * The three businesses. Roles mean the same thing on each; what varies is
 * which of them a person holds a badge for.
 */
export const SITE = {
  IT: 101,
  INDUSTRIES: 102,
  PRIVACY: 103,
} as const;

/**
 * Shape attached to `request.user` once a token has been validated.
 *
 * A session is scoped: the site and role are chosen at sign-in and signed into
 * the token, so a client cannot change them. They are still re-checked against
 * a live badge on every request — otherwise revoking someone would leave them
 * working until their access token expired.
 */
export interface AuthenticatedAdmin {
  id: string;
  email: string;
  type: 'admin';
  siteCode: number;
  roleCode: number;
}
