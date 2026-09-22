import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import type { SignOptions } from 'jsonwebtoken';
import { IsNull, LessThan, Repository } from 'typeorm';
import { SpamCheckService } from '../common/services/spam-check.service';
import { Employee } from '../hr/entities/employee.entity';
import { Admin } from './entities/admin.entity';
import { FilesService } from '../files/files.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { ARGON2_OPTIONS } from './password.constants';
import { PermissionService } from './permission.service';
import { ROLE } from './permissions.constants';
import type { ResolvedPermission } from './permission.service';

/**
 * A hash of a password nobody holds, used to spend the same CPU time on a
 * missing account as on a real one. Without it, "unknown email" returns in
 * microseconds and "wrong password" takes ~50 ms — which is a working account
 * enumeration oracle.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash(
    randomBytes(32).toString('hex'),
    ARGON2_OPTIONS,
  );
  return dummyHashPromise;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

/** The scope a session is opened with and cannot leave. */
export interface SessionScope {
  siteCode: number;
  siteName: string;
  /** Where the dashboard is served from — the client redirects here. */
  adminDomain: string;
  roleCode: number;
  roleName: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  scope: SessionScope;
}

export interface AuthenticatedProfile {
  id: string;
  email: string;
  fullName: string;
  lastLoginAt: Date | null;
  /**
   * True while the account is using a password somebody else chose — at
   * invitation, and after an admin resets one.
   *
   * Advisory, not enforced: the client shows a prompt, and everything keeps
   * working meanwhile. See the note in PermissionsGuard for why it is not a
   * hard block.
   */
  mustChangePassword: boolean;
  scope: SessionScope;
  permissions: ResolvedPermission[];
  /**
   * Their display picture, as a file id rather than a URL.
   *
   * Objects are reached through short-lived signed links, so a URL embedded
   * here would be stale long before the session was. The client asks for one
   * when it needs to render, and can refresh it without asking who it is
   * again.
   */
  avatarFileId: string | null;
  /**
   * Their own onboarding record — designation, department, employee code.
   *
   * Here rather than only on /admin/staff/:id because that route needs the
   * ADMINS feature, which would mean nobody could see their own profile
   * unless they were also allowed to administer everyone else's. Includes
   * the mobile, which the staff list withholds: it is their own number.
   */
  profile: OwnProfile | null;
}

export interface OwnProfile {
  employeeCode: string;
  designation: string;
  department: string | null;
  employmentType: string;
  workMode: string;
  mobile: string | null;
  officeCode: number | null;
  joiningDate: string | null;
}

/** What the sign-in screen renders its two pickers from. */
export interface LoginOptions {
  sites: { code: number; name: string; slug: string; adminDomain: string }[];
  roles: { code: number; name: string }[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly permissionService: PermissionService,
    private readonly spamCheck: SpamCheckService,
    // FilesModule is @Global, so this needs no import and creates no cycle.
    private readonly filesService: FilesService,
  ) {}

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  /**
   * Sign in to one dashboard, as one role.
   *
   * The site and role picked on the sign-in screen are a *request*, never an
   * authorisation. They are validated against a live badge before any token
   * exists, and then signed into it — so the resulting session cannot be
   * widened, and cannot be moved to another brand, without signing in again.
   *
   * Failure messages are deliberately asymmetric. Before identity is proven,
   * everything returns the same 401, because a specific message would let
   * someone discover which accounts exist. Afterwards the message can name the
   * problem, because at that point they have proved who they are and a vague
   * error only generates support tickets.
   */
  async login(
    email: string,
    password: string,
    siteCode: number,
    roleCode: number,
    context: RequestContext,
  ): Promise<TokenPair> {
    const admin = await this.adminRepo.findOne({
      where: { email: email.trim().toLowerCase(), isDeleted: false },
      select: ['id', 'email', 'passwordHash', 'fullName', 'isActive'],
    });

    // Verify against a throwaway hash when the account is absent, so both paths
    // cost the same. Then fail with one message for every reason — wrong email,
    // wrong password and disabled account are indistinguishable from outside.
    // A null hash means an account predating the rule that a password is set
    // when access is granted — nothing to verify against. Burn the same time
    // as a real check and give the same answer: whether an account exists, and
    // whether it can be used, are both things an attacker would like to learn.
    if (!admin || !admin.passwordHash) {
      await argon2.verify(await getDummyHash(), password).catch(() => false);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await argon2
      .verify(admin.passwordHash, password)
      .catch(() => false);

    if (!passwordOk || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Argon2 records its own cost parameters. If ours have since been raised,
    // this is the only moment we hold the plaintext, so it is the only moment
    // we can upgrade the stored hash.
    if (argon2.needsRehash(admin.passwordHash, ARGON2_OPTIONS)) {
      const rehashed = await argon2.hash(password, ARGON2_OPTIONS);
      await this.adminRepo.update({ id: admin.id }, { passwordHash: rehashed });
      this.logger.log(`Rehashed password for ${admin.email} at current cost`);
    }

    // Identity is proven from here, so the remaining failures can be specific.
    const scope = await this.resolveScope(admin.id, siteCode, roleCode);

    await this.adminRepo.update({ id: admin.id }, { lastLoginAt: new Date() });

    // A fresh familyId: this is a new chain, unrelated to any other device —
    // including this person's session on another brand.
    const issued = await this.issueTokens(
      admin.id,
      admin.email,
      scope,
      randomUUID(),
      context,
    );

    this.logger.log(
      `${admin.email} signed in to ${scope.siteName} as ${scope.roleName}`,
    );

    return stripInternals(issued);
  }

  /**
   * Turns a requested (site, role) into a scope, or refuses.
   *
   * Refusing here rather than at the first guarded request means someone who
   * picks the wrong dashboard is told immediately, instead of signing in
   * successfully and then being denied everywhere.
   */
  private async resolveScope(
    adminId: string,
    siteCode: number,
    roleCode: number,
  ): Promise<SessionScope> {
    const site = await this.permissionService.findSite(siteCode);
    if (!site) {
      throw new ForbiddenException('That dashboard is unavailable');
    }

    /*
     * PENDING is a state, not a job.
     *
     * It is a real badge, so the lookup below would happily find it and hand
     * back a working session. Refused here instead, because "created, awaiting
     * a role" is not something anyone should be able to sign in AS — the
     * account has no permissions, so the session could only ever be an empty
     * dashboard, and offering it invites the question of why it exists.
     *
     * The normal path already avoids it: granting access requires a real role,
     * so PENDING cannot be reached on a new account. This closes the
     * hand-crafted request, and the accounts still holding it from before.
     */
    if (roleCode === ROLE.PENDING) {
      throw new ForbiddenException(
        'That role cannot be used to sign in. Ask an administrator to assign ' +
          'you a role for this dashboard.',
      );
    }

    const badges = await this.permissionService.listBadges(adminId);
    const badge = badges.find(
      (b) => b.siteCode === siteCode && b.roleCode === roleCode,
    );

    if (!badge) {
      const onThisSite = badges.filter((b) => b.siteCode === siteCode);
      throw new ForbiddenException(
        onThisSite.length === 0
          ? `You do not have access to ${site.siteName}`
          : `You do not hold that role on ${site.siteName}. You hold: ` +
              onThisSite.map((b) => b.role?.roleName ?? b.roleCode).join(', '),
      );
    }

    return {
      siteCode: site.siteCode,
      siteName: site.siteName,
      adminDomain: site.adminDomain,
      roleCode: badge.roleCode,
      roleName: badge.role?.roleName ?? String(badge.roleCode),
    };
  }

  /** The two pickers on the sign-in screen, served rather than hardcoded. */
  async loginOptions(): Promise<LoginOptions> {
    const [sites, roles] = await Promise.all([
      this.permissionService.listSites(),
      this.permissionService.listAssignableRoles(),
    ]);

    return {
      sites: sites.map((s) => ({
        code: s.siteCode,
        name: s.siteName,
        slug: s.slug,
        adminDomain: s.adminDomain,
      })),
      roles,
    };
  }

  // -------------------------------------------------------------------------
  // Refresh — rotation with reuse detection
  // -------------------------------------------------------------------------

  /**
   * Exchanges a refresh token for a new pair and retires the old one.
   *
   * Because each token is single-use, a token that arrives already-revoked can
   * only mean it was captured and replayed — the legitimate client would have
   * moved on to its successor. That is treated as a compromise of the whole
   * chain, not a retryable error: every token in the family is revoked, which
   * logs out both the attacker and the victim. The victim logging in again is a
   * far better outcome than the attacker holding a session indefinitely.
   */
  async refresh(
    presented: string,
    context: RequestContext,
  ): Promise<TokenPair> {
    const tokenHash = hashToken(presented);
    const existing = await this.refreshRepo.findOne({ where: { tokenHash } });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      await this.refreshRepo.update(
        { familyId: existing.familyId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      this.logger.warn(
        `Refresh token reuse detected for subject ${existing.subjectId}; revoked family ${existing.familyId}`,
      );
      throw new ForbiddenException(
        'This session has been ended for security reasons. Please sign in again.',
      );
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    if (existing.subjectType !== 'admin') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const admin = await this.adminRepo.findOne({
      where: { id: existing.subjectId, isDeleted: false },
      select: ['id', 'email', 'isActive'],
    });

    // An account disabled mid-session must not be able to refresh its way past
    // the change — the access token expires within minutes, this closes the rest.
    if (!admin?.isActive) {
      await this.refreshRepo.update(
        { familyId: existing.familyId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException('Account is no longer active');
    }

    // Sessions opened before multi-site carry no scope. Rather than guessing
    // one, end them — their owners sign in again and pick a dashboard.
    if (!existing.siteCode || !existing.roleCode) {
      await this.refreshRepo.update(
        { familyId: existing.familyId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException(
        'This session predates the multi-site portal. Please sign in again.',
      );
    }

    // The badge that opened this session may have been revoked since. Refusing
    // here is what stops a refresh outliving someone's access.
    const scope = await this.resolveScope(
      admin.id,
      existing.siteCode,
      existing.roleCode,
    ).catch(async (error: unknown) => {
      await this.refreshRepo.update(
        { familyId: existing.familyId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw error;
    });

    const issued = await this.issueTokens(
      admin.id,
      admin.email,
      scope,
      existing.familyId,
      context,
    );

    await this.refreshRepo.update(
      { id: existing.id },
      { revokedAt: new Date(), replacedBy: issued.refreshTokenId },
    );

    return stripInternals(issued);
  }

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  /** Revokes the presented token's whole family — this device's session. */
  async logout(presented: string): Promise<{ revoked: number }> {
    const existing = await this.refreshRepo.findOne({
      where: { tokenHash: hashToken(presented) },
    });

    // Logging out with an unknown token still reports success. There is nothing
    // to protect here, and reporting failure would confirm which tokens exist.
    if (!existing) return { revoked: 0 };

    const result = await this.refreshRepo.update(
      { familyId: existing.familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    return { revoked: result.affected ?? 0 };
  }

  /** Revokes every session for an admin, across all devices. */
  async logoutEverywhere(adminId: string): Promise<{ revoked: number }> {
    const result = await this.refreshRepo.update(
      { subjectId: adminId, subjectType: 'admin', revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return { revoked: result.affected ?? 0 };
  }

  // -------------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------------

  /**
   * The signed-in session — one brand, one role.
   *
   * Deliberately does NOT list the other brands this person can reach. There is
   * no in-app switcher, so that list would only be information the dashboard
   * cannot act on. Reaching another brand means signing in again.
   */
  async getProfile(
    adminId: string,
    siteCode: number,
    roleCode: number,
  ): Promise<AuthenticatedProfile> {
    const admin = await this.adminRepo.findOne({
      where: { id: adminId, isDeleted: false },
    });

    if (!admin) throw new UnauthorizedException('Account not found');

    const [scope, permissions, profile] = await Promise.all([
      this.resolveScope(adminId, siteCode, roleCode),
      this.permissionService.listSessionPermissions(roleCode, siteCode),
      /*
       * Reached through the account's `employeeId`, and null for the service
       * accounts — they are credentials, not people, so there is no personnel
       * record behind them and their profile card has nothing to show.
       *
       * Deliberately not selecting `monthlyNetPay`: this is the "my profile"
       * read, available to anyone signed in, and salary is gated behind
       * FEATURE.HR. Someone's own pay is a payroll question, not a session one.
       */
      admin.employeeId
        ? this.employeeRepo.findOne({
            where: { id: admin.employeeId },
            relations: { department: true },
            select: {
              // `id` is not optional even though nothing reads it: joining a
              // relation makes TypeORM build a DISTINCT-on-primary-key wrapper,
              // and omitting the key leaves that wrapper selecting a column it
              // never asked the query for.
              id: true,
              employeeCode: true,
              designation: true,
              employmentType: true,
              workMode: true,
              mobile: true,
              officeCode: true,
              joiningDate: true,
              department: { departmentCode: true, departmentName: true },
            },
          })
        : Promise.resolve(null),
    ]);

    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      lastLoginAt: admin.lastLoginAt,
      mustChangePassword: admin.mustChangePassword,
      scope,
      permissions,
      avatarFileId: admin.avatarFileId,
      profile: profile
        ? {
            employeeCode: profile.employeeCode,
            designation: profile.designation,
            department: profile.department?.departmentName ?? null,
            employmentType: profile.employmentType,
            workMode: profile.workMode,
            mobile: profile.mobile,
            officeCode: profile.officeCode,
            joiningDate: profile.joiningDate,
          }
        : null,
    };
  }

  // -------------------------------------------------------------------------
  // Change password
  // -------------------------------------------------------------------------

  /**
   * Set or clear your own display picture.
   *
   * Self-service by design: it needs no ADMINS permission, because choosing
   * your own photograph is not administering anybody. The file must already
   * have been uploaded under the PROFILE_PHOTO purpose, which is where the
   * size and format rules are enforced — this only records which file it is.
   *
   * The previous photo is deleted rather than orphaned. Nothing else points at
   * it, and leaving every avatar anyone ever chose in the bucket is a slow
   * leak of storage and of faces.
   */
  async setAvatar(adminId: string, fileId: string | null): Promise<{ avatarFileId: string | null }> {
    const admin = await this.adminRepo.findOne({
      where: { id: adminId, isDeleted: false },
    });
    if (!admin) throw new NotFoundException('No such account');

    if (fileId) {
      const file = await this.filesService.findById(fileId);
      if (file.purpose !== 'PROFILE_PHOTO') {
        throw new BadRequestException(
          'That file was not uploaded as a profile photo.',
        );
      }
    }

    const previous = admin.avatarFileId;
    await this.adminRepo.update({ id: adminId }, { avatarFileId: fileId });

    if (previous && previous !== fileId) {
      // Best effort: the account already points at the new picture, and a
      // failure to tidy the old one must not fail the request.
      try {
        await this.filesService.remove(previous);
      } catch (error) {
        this.logger.warn(
          `Could not remove the previous avatar ${previous}: ${(error as Error).message}`,
        );
      }
    }

    return { avatarFileId: fileId };
  }

  /**
   * A link to your own profile photo.
   *
   * Its own route rather than the generic file one, for two reasons the
   * generic route cannot serve. It is gated on being signed in rather than on
   * FEATURE.FILES, which a Viewer does not hold — they could set a photo and
   * then never see it. And it is not site-scoped: an avatar belongs to the
   * account, so the root administrator's picture must not vanish when they
   * move between dashboards.
   */
  async avatarUrl(
    adminId: string,
  ): Promise<{ url: string | null; expiresInSeconds: number | null }> {
    const admin = await this.adminRepo.findOne({
      where: { id: adminId, isDeleted: false },
      select: ['id', 'avatarFileId'],
    });
    if (!admin?.avatarFileId) return { url: null, expiresInSeconds: null };

    try {
      return await this.filesService.downloadUrl(admin.avatarFileId);
    } catch {
      /*
       * The row points at a file that is no longer there — purged, or removed
       * out from under it. Answering "no photo" is the truth the caller can
       * act on; a 404 here would break a page over a decoration.
       */
      return { url: null, expiresInSeconds: null };
    }
  }

  async changePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string; sessionsRevoked: number }> {
    const admin = await this.adminRepo.findOne({
      where: { id: adminId, isDeleted: false },
      select: ['id', 'email', 'passwordHash'],
    });

    if (!admin?.passwordHash) {
      throw new UnauthorizedException('Account not found');
    }

    const ok = await argon2
      .verify(admin.passwordHash, currentPassword)
      .catch(() => false);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    if (
      await argon2.verify(admin.passwordHash, newPassword).catch(() => false)
    ) {
      throw new ForbiddenException(
        'New password must differ from the current one',
      );
    }

    await this.adminRepo.update(
      { id: adminId },
      {
        passwordHash: await argon2.hash(newPassword, ARGON2_OPTIONS),
        // This one is theirs, so the rest of the dashboard opens up.
        mustChangePassword: false,
      },
    );

    // A password change is how someone responds to a suspected compromise, so
    // it has to end the sessions the attacker might be holding.
    const { revoked } = await this.logoutEverywhere(adminId);

    return {
      message: 'Password changed. Please sign in again.',
      sessionsRevoked: revoked,
    };
  }

  // -------------------------------------------------------------------------
  // Housekeeping
  // -------------------------------------------------------------------------

  /** Deletes refresh tokens that expired over 30 days ago. */
  async purgeExpiredTokens(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.refreshRepo.delete({
      expiresAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async issueTokens(
    adminId: string,
    email: string,
    scope: SessionScope,
    familyId: string,
    context: RequestContext,
  ): Promise<IssuedTokens> {
    const ttl = this.config.get<string>('ADMIN_ACCESS_TOKEN_TTL') ?? '15m';
    const refreshDays = Number(
      this.config.get<string>('ADMIN_REFRESH_TOKEN_TTL_DAYS') ?? '7',
    );

    // The scope is signed into the token, which is what removes the need for a
    // site header the client could edit. It still proves only what was true at
    // sign-in — the guard re-checks the badge on every request.
    const accessToken = await this.jwt.signAsync(
      {
        sub: adminId,
        email,
        type: 'admin',
        site: scope.siteCode,
        role: scope.roleCode,
      },
      { expiresIn: ttl as SignOptions['expiresIn'] },
    );

    // 48 random bytes, not a JWT. A refresh token carries no claims — it is a
    // lookup key, and being opaque is what lets the server revoke it.
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    const row = await this.refreshRepo.save(
      this.refreshRepo.create({
        subjectId: adminId,
        subjectType: 'admin',
        tokenHash: hashToken(refreshToken),
        familyId,
        siteCode: scope.siteCode,
        roleCode: scope.roleCode,
        expiresAt,
        ipHash: this.spamCheck.hashIp(context.ip),
      }),
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: parseTtlSeconds(ttl),
      tokenType: 'Bearer',
      scope,
      refreshTokenId: row.id,
    };
  }
}

/** Internal shape: the token pair plus the row id, so rotation can link them. */
interface IssuedTokens extends TokenPair {
  refreshTokenId: string;
}

/** Drops the row id — it is used to link a rotation, never sent to a client. */
function stripInternals(issued: IssuedTokens): TokenPair {
  return {
    scope: issued.scope,
    accessToken: issued.accessToken,
    refreshToken: issued.refreshToken,
    expiresIn: issued.expiresIn,
    tokenType: issued.tokenType,
  };
}

/**
 * Plain SHA-256, deliberately — not argon2.
 *
 * Argon2 is slow on purpose because passwords are low-entropy and guessable.
 * A refresh token is 48 random bytes; there is nothing to guess, so the only
 * job here is to make a database dump useless, and a fast digest does that
 * while keeping the lookup a single indexed equality check.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** `15m` / `2h` / `900s` / `900` → seconds, for the `expiresIn` response field. */
function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!match) return 900;
  const value = Number(match[1]);
  switch (match[2]) {
    case 'd':
      return value * 86400;
    case 'h':
      return value * 3600;
    case 'm':
      return value * 60;
    default:
      return value;
  }
}
