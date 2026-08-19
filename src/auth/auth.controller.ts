import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { AuthService } from './auth.service';
import type {
  AuthenticatedProfile,
  LoginOptions,
  TokenPair,
} from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import type { AuthenticatedAdmin } from './permissions.constants';

/**
 * The staff identity surface.
 *
 * Login and refresh are unauthenticated by necessity, so both carry their own
 * throttle far tighter than the global one — these are the two endpoints an
 * attacker would hammer.
 */
@ApiTags('Auth (admin)')
@Controller('admin/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 5 attempts per minute per IP. Enough for a typo, not for a wordlist. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Sign in and receive an access + refresh token pair',
  })
  @ResponseMessage('Signed in')
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<TokenPair> {
    return this.authService.login(
      dto.email,
      dto.password,
      dto.siteCode,
      dto.roleCode,
      { ip: request.ip, userAgent: request.get('user-agent') },
    );
  }

  /**
   * The two pickers on the sign-in screen. Public and unauthenticated by
   * necessity — it is read before anyone has signed in. Neither site names nor
   * role names are secret, and serving them keeps the login page in step with
   * the database instead of hardcoding a list that drifts.
   */
  @Get('login-options')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Dashboards and roles for the sign-in screen' })
  @ResponseMessage('Login options retrieved')
  loginOptions(): Promise<LoginOptions> {
    return this.authService.loginOptions();
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Exchange a refresh token for a new pair (single use — rotates)',
  })
  @ResponseMessage('Token refreshed')
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
  ): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken, {
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  /**
   * Takes the refresh token rather than the access token: the access token
   * expires on its own within minutes, whereas the refresh token is the thing
   * that keeps a session alive and therefore the thing worth revoking.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End this session (revokes the token family)' })
  @ResponseMessage('Signed out')
  logout(@Body() dto: RefreshTokenDto): Promise<{ revoked: number }> {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'End every session for this account, all devices' })
  @ResponseMessage('All sessions ended')
  logoutAll(
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ revoked: number }> {
    return this.authService.logoutEverywhere(admin.id);
  }

  @Get('me')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'The signed-in account, its roles and permissions' })
  @ResponseMessage('Profile retrieved')
  me(@CurrentUser() admin: AuthenticatedAdmin): Promise<AuthenticatedProfile> {
    return this.authService.getProfile(
      admin.id,
      admin.siteCode,
      admin.roleCode,
    );
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth('jwt')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Change your own password; ends every session' })
  @ResponseMessage('Password changed')
  changePassword(
    @CurrentUser() admin: AuthenticatedAdmin,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string; sessionsRevoked: number }> {
    return this.authService.changePassword(
      admin.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
