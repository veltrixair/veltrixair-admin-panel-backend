import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../permissions.constants';
import type { RequiredPermission } from '../permissions.constants';

/**
 * Declares what a route requires.
 *
 *   @Permissions(FEATURE.IT_CAREERS, PERMISSION.CREATE)
 *
 * A route with no decorator passes the permissions guard — authentication is
 * enforced separately by AdminJwtGuard, so an undecorated admin route is still
 * login-protected, just not permission-scoped.
 */
export const Permissions = (featureCode: number, permissionCode: number) =>
  SetMetadata(PERMISSIONS_KEY, [
    featureCode,
    permissionCode,
  ] as RequiredPermission);
