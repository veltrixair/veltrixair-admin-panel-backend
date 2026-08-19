import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SITE_SCOPE_KEY } from '../permissions.constants';
import type { AuthenticatedAdmin } from '../permissions.constants';

/**
 * Refuses a single-brand route to a session signed in to another brand.
 *
 * The permissions guard answers "does this role hold this feature?", which is
 * the wrong question for a feature only one brand has: `role_permissions` is
 * (role, feature) with no site column, so SUPER_ADMIN holds crane and privacy
 * features on every dashboard it can sign in to.
 *
 * The scope on `request.user` was signed at sign-in and re-verified against the
 * badge table by the permissions guard, so by the time this runs the site claim
 * is trustworthy — this only has to compare it.
 *
 * 403 rather than 404: the caller is a legitimate admin who is simply on the
 * wrong dashboard, and telling them so is more useful than pretending the
 * feature does not exist. Individual records still answer 404 across brands.
 */
@Injectable()
export class SiteScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<number | undefined>(
      SITE_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (required === undefined) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedAdmin }>();
    const admin = request.user;

    if (!admin) {
      throw new UnauthorizedException('Not authenticated');
    }

    if (admin.siteCode !== required) {
      throw new ForbiddenException(
        'This feature belongs to another dashboard. Sign in to that site to reach it.',
      );
    }

    return true;
  }
}
