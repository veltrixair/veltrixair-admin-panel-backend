import { SetMetadata } from '@nestjs/common';
import { SITE_SCOPE_KEY } from '../permissions.constants';

/**
 * Declares that a controller belongs to exactly one brand.
 *
 *   @SiteScope(SITE.INDUSTRIES)
 *
 * For features that only one brand has — crane quotes, crane site visits,
 * privacy enquiries — because `role_permissions` has no site dimension. A role
 * that holds a feature holds it on every dashboard, so SUPER_ADMIN signed in to
 * the IT dashboard would otherwise pass the permissions guard on a crane route.
 *
 * Shared features (contact, careers, insights) must NOT use this: they exist on
 * every brand and are separated by filtering on the badge's site instead.
 */
export const SiteScope = (siteCode: number) =>
  SetMetadata(SITE_SCOPE_KEY, siteCode);
