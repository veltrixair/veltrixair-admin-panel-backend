import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedAdmin } from '../permissions.constants';

export interface AdminJwtPayload {
  sub: string;
  email: string;
  type: string;
  /** The business this session was opened against. */
  site: number;
  /** The role it was opened as. */
  role: number;
  iat?: number;
  exp?: number;
}

/**
 * Validates a staff access token.
 *
 * The `type` claim is checked explicitly rather than trusted implicitly. Today
 * there is one secret and one token shape, so it looks redundant — but the
 * moment a second subject type exists, this line is what stops a client token
 * reaching a staff route if the secrets ever got crossed.
 *
 * `site` and `role` are required. A token without them predates multi-site and
 * carries no scope, so it is refused rather than defaulted to anything — a
 * guessed scope is how one brand's data ends up in another brand's dashboard.
 */
@Injectable()
export class JwtAdminStrategy extends PassportStrategy(Strategy, 'jwt-admin') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('ADMIN_JWT_SECRET'),
    });
  }

  validate(payload: AdminJwtPayload): AuthenticatedAdmin {
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Invalid token type');
    }
    if (!payload.site || !payload.role) {
      throw new UnauthorizedException('Token carries no scope; sign in again');
    }
    return {
      id: payload.sub,
      email: payload.email,
      type: 'admin',
      siteCode: payload.site,
      roleCode: payload.role,
    };
  }
}
