import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../permission.service';
import { PERMISSIONS_KEY } from '../permissions.constants';
import type {
  AuthenticatedAdmin,
  RequiredPermission,
} from '../permissions.constants';

/**
 * Checks what a route declared with @Permissions against what the caller holds,
 * on the site their session is scoped to.
 *
 * Runs after AdminJwtGuard, so `request.user` carries a scope the client could
 * not have tampered with — it was signed at sign-in. What the client cannot
 * forge, though, it can outlive: the badge behind that scope may have been
 * revoked since. So the check always goes back to the table.
 *
 * A route without the decorator passes straight through — authentication has
 * still been enforced, the route simply isn't permission-scoped.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      RequiredPermission | undefined
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!required) return true;

    const [featureCode, permissionCode] = required;
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedAdmin }>();
    const user = request.user;

    if (!user?.id || user.type !== 'admin') {
      throw new UnauthorizedException('Authentication required');
    }

    const allowed = await this.permissionService.hasAdminPermission(
      user.id,
      user.siteCode,
      user.roleCode,
      featureCode,
      permissionCode,
    );

    if (!allowed) {
      throw new ForbiddenException(
        `Your role does not allow this action on this dashboard ` +
          `(site ${user.siteCode}, feature ${featureCode}, permission ${permissionCode})`,
      );
    }

    return true;
  }
}
