import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { SiteRequest } from './site-context.middleware';

/**
 * The brand a **public** request belongs to, resolved from its origin.
 *
 *   submit(@Body() dto: CreateEnquiryDto, @CurrentSite() siteCode: number)
 *
 * Admin routes must NOT use this — their site comes from the signed token via
 * `@CurrentUser().siteCode`, which a client cannot tamper with. Reading it from
 * the request there would hand the caller a way to choose their own scope.
 */
export const CurrentSite = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest<SiteRequest>();
    if (!request.siteCode) {
      // The middleware throws before this, so reaching here means a public
      // route was mounted outside its coverage.
      throw new Error(
        'No site resolved for this request — is SiteContextMiddleware applied to this route?',
      );
    }
    return request.siteCode;
  },
);
