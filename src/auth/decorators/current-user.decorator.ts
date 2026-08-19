import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedAdmin } from '../permissions.constants';

/**
 * The authenticated staff user, for audit trails.
 *
 *   @CurrentUser() admin: AuthenticatedAdmin
 *
 * This is what replaces the `currentActor(): null` stubs that every admin
 * controller has been carrying — the audit rows were always shaped for a real
 * actor, they just had nobody to name.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedAdmin | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedAdmin }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
