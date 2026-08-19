import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Requires a valid staff access token. */
@Injectable()
export class AdminJwtGuard extends AuthGuard('jwt-admin') {}
