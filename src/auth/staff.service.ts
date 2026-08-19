import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { In, IsNull, Not, Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ListStaffDto } from './dto/list-staff.dto';
import { CreateStaffDto, UpdateStaffDto } from './dto/upsert-staff.dto';
import { AdminRole } from './entities/admin-role.entity';
import { Admin } from './entities/admin.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RoleMaster } from './entities/role-master.entity';
import { RolePermission } from './entities/role-permission.entity';
import { SiteMaster } from '../master-data/entities/site-master.entity';
import { ARGON2_OPTIONS } from './password.constants';
import { ROLE } from './permissions.constants';

/** One badge: a role held on one brand. */
export interface StaffRole {
  code: number;
  name: string;
  siteCode: number;
  siteName: string;
  assignedAt: Date;
}

export interface StaffMember {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdDate: Date;
  roles: StaffRole[];
}

/** Returned once, at creation or reset. Never retrievable afterwards. */
export interface StaffWithPassword extends StaffMember {
  temporaryPassword: string;
  passwordNotice: string;
}

const PASSWORD_NOTICE =
  'Give this to the account holder over a channel you trust, and have them ' +
  'change it at first sign-in. It is not stored in readable form and cannot ' +
  'be shown again.';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    @InjectRepository(AdminRole)
    private readonly adminRoleRepo: Repository<AdminRole>,
    @InjectRepository(RoleMaster)
    private readonly roleRepo: Repository<RoleMaster>,
    @InjectRepository(RolePermission)
    private readonly rolePermRepo: Repository<RolePermission>,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
    @InjectRepository(SiteMaster)
    private readonly siteRepo: Repository<SiteMaster>,
  ) {}

  // -------------------------------------------------------------- reading

  async list(
    query: ListStaffDto,
    actorSite: number,
  ): Promise<PaginatedResult<StaffMember>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.adminRepo
      .createQueryBuilder('admin')
      .where('admin.isDeleted = false')
      // Only people holding a badge on the dashboard the caller signed in
      // to. Without this an admin for one brand can enumerate every
      // colleague in the company, which is not theirs to see.
      .andWhere(
        `EXISTS (
           SELECT 1 FROM admin_roles ar
           WHERE ar.admin_id = admin.id
             AND ar.site_code = :actorSite
             AND ar.revoked_at IS NULL
         )`,
        { actorSite },
      );

    if (query.search) {
      qb.andWhere(
        '(admin.fullName ILIKE :search OR admin.email ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.isActive !== undefined) {
      qb.andWhere('admin.isActive = :isActive', { isActive: query.isActive });
    }

    if (query.roleCode !== undefined) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM admin_roles ar
           WHERE ar.admin_id = admin.id
             AND ar.role_code = :roleCode
             AND ar.revoked_at IS NULL
         )`,
        { roleCode: query.roleCode },
      );
    }

    const [admins, total] = await qb
      .orderBy('admin.createdDate', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // One query for every listed admin's roles rather than one per row.
    const roleMap = await this.rolesFor(admins.map((a) => a.id));

    return {
      items: admins.map((admin) => this.toStaffMember(admin, roleMap)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /** For the caller — refuses accounts that are not on their dashboard. */
  async view(id: string, actorSite: number): Promise<StaffMember> {
    await this.requireVisible(id, actorSite);
    return this.findById(id);
  }

  /** Internal: shapes a record without a visibility check. */
  async findById(id: string): Promise<StaffMember> {
    const admin = await this.requireAdmin(id);
    const roleMap = await this.rolesFor([id]);
    return this.toStaffMember(admin, roleMap);
  }

  /** Roles and the matrix, read-only — what a role picker renders from. */
  async listRoles(): Promise<
    {
      code: number;
      name: string;
      description: string | null;
      permissions: { featureCode: number; permissionCode: number }[];
    }[]
  > {
    const [roles, grants] = await Promise.all([
      this.roleRepo.find({
        where: { isActive: true },
        order: { roleCode: 'ASC' },
      }),
      this.rolePermRepo.find(),
    ]);

    return roles.map((role) => ({
      code: role.roleCode,
      name: role.roleName,
      description: role.description,
      permissions: grants
        .filter((g) => g.roleCode === role.roleCode)
        .map((g) => ({
          featureCode: g.featureCode,
          permissionCode: g.permissionCode,
        }))
        .sort(
          (a, b) =>
            a.featureCode - b.featureCode ||
            a.permissionCode - b.permissionCode,
        ),
    }));
  }

  // -------------------------------------------------------------- creating

  async create(
    dto: CreateStaffDto,
    actorId: string,
    actorSite: number,
  ): Promise<StaffWithPassword> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.adminRepo.findOne({
      where: { email },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException(`${email} already has an account`);
    }

    await this.requireRolesExist(dto.roleCodes);

    // Generated server-side rather than accepted from the request: a password
    // chosen by one person for another tends to be weak and tends to get
    // reused. ~144 bits, meant to be replaced at first sign-in.
    const temporaryPassword = randomBytes(24).toString('base64url');

    const admin = await this.adminRepo.save(
      this.adminRepo.create({
        email,
        fullName: dto.fullName.trim(),
        passwordHash: await argon2.hash(temporaryPassword, ARGON2_OPTIONS),
        createdBy: actorId,
      }),
    );

    await this.adminRoleRepo.save(
      dto.roleCodes.map((roleCode) =>
        this.adminRoleRepo.create({
          adminId: admin.id,
          roleCode,
          siteCode: actorSite,
          assignedBy: actorId,
        }),
      ),
    );

    this.logger.log(
      `Staff account created: ${email} on site ${actorSite} by ${actorId}`,
    );

    const roleMap = await this.rolesFor([admin.id]);
    return {
      ...this.toStaffMember(admin, roleMap),
      temporaryPassword,
      passwordNotice: PASSWORD_NOTICE,
    };
  }

  // -------------------------------------------------------------- updating

  async update(
    id: string,
    dto: UpdateStaffDto,
    actorId: string,
    actorSite: number,
  ): Promise<StaffMember> {
    await this.requireVisible(id, actorSite);
    await this.refuseProtected(id, actorId, 'Changing');

    // Deactivation ends every session on every brand, so it is only yours
    // to do when the account's access is entirely within your dashboard.
    if (dto.isActive === false) {
      await this.requireWhollyWithin(id, actorSite, 'Deactivating');
    }

    const admin = await this.requireAdmin(id);

    if (dto.fullName !== undefined) {
      admin.fullName = dto.fullName.trim();
    }

    if (dto.isActive !== undefined && dto.isActive !== admin.isActive) {
      if (!dto.isActive) {
        this.refuseSelf(id, actorId, 'deactivate your own account');
        // undefined: deactivation removes them from every brand at once.
        await this.refuseLastSuperAdmin(id, undefined, 'Deactivating');
      }
      admin.isActive = dto.isActive;
    }

    await this.adminRepo.save(admin);

    // Deactivation has to end the sessions, not just block future logins —
    // otherwise an offboarded account keeps working until its refresh token
    // expires, which is up to a week.
    if (dto.isActive === false) {
      const revoked = await this.revokeSessions(id);
      this.logger.log(
        `Deactivated ${admin.email} by ${actorId}; revoked ${revoked} session(s)`,
      );
    }

    return this.findById(id);
  }

  // ----------------------------------------------------------------- roles

  /**
   * Grant one badge — a role on one brand.
   *
   * Idempotent: granting a badge already held is a no-op, not an error.
   * Granting the same role on a different site is a genuinely new badge, which
   * is how one person covers recruitment for both IT and cranes.
   */
  async grantRole(
    id: string,
    roleCode: number,
    actorId: string,
    actorSite: number,
  ): Promise<StaffMember> {
    const siteCode = actorSite;
    await this.refuseProtected(id, actorId, 'Granting a role to');
    // No visibility check here, unlike every other write. Granting access
    // to YOUR dashboard is your authority even when the account is
    // currently invisible to you — otherwise nobody could ever be given
    // access to a second brand, since create() rejects the email as taken
    // and they never appear in your list.
    this.refuseSelf(id, actorId, 'change your own roles');
    await this.requireAdmin(id);
    await this.requireRolesExist([roleCode]);
    await this.requireSiteExists(siteCode);

    const held = await this.adminRoleRepo.findOne({
      where: { adminId: id, roleCode, siteCode, revokedAt: IsNull() },
    });

    if (!held) {
      await this.adminRoleRepo.save(
        this.adminRoleRepo.create({
          adminId: id,
          roleCode,
          siteCode,
          assignedBy: actorId,
        }),
      );
      this.logger.log(
        `Granted role ${roleCode} on site ${siteCode} to ${id} by ${actorId}`,
      );
    }

    return this.findById(id);
  }

  /** Revoke one badge. Revoking one not held is a no-op, not an error. */
  async revokeRole(
    id: string,
    roleCode: number,
    siteCode: number,
    actorId: string,
    actorSite: number,
  ): Promise<StaffMember> {
    this.requireOwnSite(siteCode, actorSite);
    await this.requireVisible(id, actorSite);
    await this.refuseProtected(id, actorId, 'Revoking a role from');
    this.refuseSelf(id, actorId, 'change your own roles');
    await this.requireAdmin(id);

    const held = await this.adminRoleRepo.findOne({
      where: { adminId: id, roleCode, siteCode, revokedAt: IsNull() },
    });

    if (held) {
      // Counted across every brand, not just this one. Removing someone's
      // crane access while they still work IT is ordinary; leaving an account
      // that can sign in nowhere is the thing worth refusing.
      const remaining = await this.adminRoleRepo.count({
        where: { adminId: id, revokedAt: IsNull() },
      });
      if (remaining <= 1) {
        throw new ConflictException(
          'An account must keep at least one role somewhere. Deactivate it instead, or assign a different role first.',
        );
      }

      if (roleCode === ROLE.SUPER_ADMIN) {
        await this.refuseLastSuperAdmin(
          id,
          siteCode,
          'Removing SUPER_ADMIN from',
        );
      }

      await this.adminRoleRepo.update(
        { id: held.id },
        { revokedAt: new Date(), revokedBy: actorId },
      );
      this.logger.log(
        `Revoked role ${roleCode} on site ${siteCode} from ${id} by ${actorId}`,
      );
    }

    return this.findById(id);
  }

  /**
   * Replace the role set **for one brand**, leaving other brands untouched.
   *
   * Scoped to a single site on purpose: a checkbox form on the cranes screen
   * should not silently strip someone's IT access because those boxes weren't
   * on the page. Roles no longer present are revoked, new ones granted,
   * unchanged ones left alone — so an assignment's history and its original
   * `assignedBy` survive a save that didn't actually touch it.
   */
  async replaceRoles(
    id: string,
    roleCodes: number[],
    actorId: string,
    actorSite: number,
  ): Promise<StaffMember> {
    const siteCode = actorSite;
    await this.requireVisible(id, actorSite);
    await this.refuseProtected(id, actorId, 'Changing the roles of');
    this.refuseSelf(id, actorId, 'change your own roles');
    await this.requireAdmin(id);
    await this.requireRolesExist(roleCodes);
    await this.requireSiteExists(siteCode);

    const current = await this.adminRoleRepo.find({
      where: { adminId: id, siteCode, revokedAt: IsNull() },
    });
    const currentCodes = new Set(current.map((r) => r.roleCode));
    const wanted = new Set(roleCodes);

    const removing = current.filter((r) => !wanted.has(r.roleCode));
    const adding = roleCodes.filter((code) => !currentCodes.has(code));

    if (removing.some((r) => r.roleCode === ROLE.SUPER_ADMIN)) {
      await this.refuseLastSuperAdmin(
        id,
        siteCode,
        'Removing SUPER_ADMIN from',
      );
    }

    await this.adminRoleRepo.manager.transaction(async (manager) => {
      if (removing.length > 0) {
        await manager.update(
          AdminRole,
          { id: In(removing.map((r) => r.id)) },
          { revokedAt: new Date(), revokedBy: actorId },
        );
      }
      if (adding.length > 0) {
        await manager.save(
          adding.map((roleCode) =>
            manager.create(AdminRole, {
              adminId: id,
              roleCode,
              siteCode,
              assignedBy: actorId,
            }),
          ),
        );
      }
    });

    this.logger.log(
      `Replaced roles for ${id} by ${actorId}: +[${adding.join(',')}] -[${removing
        .map((r) => r.roleCode)
        .join(',')}]`,
    );

    return this.findById(id);
  }

  /** The history, including revoked assignments — this is the audit trail. */
  async listRoleHistory(id: string, actorSite: number): Promise<AdminRole[]> {
    await this.requireVisible(id, actorSite);
    // Deliberately the WHOLE history, including badges on other
    // dashboards. Once someone is on yours, how they came to hold access
    // is part of the trail you are responsible for.
    return this.adminRoleRepo.find({
      where: { adminId: id },
      relations: { role: true },
      order: { assignedDate: 'DESC' },
    });
  }

  // ------------------------------------------------------------- passwords

  async resetPassword(
    id: string,
    actorId: string,
    actorSite: number,
  ): Promise<StaffWithPassword> {
    await this.requireVisible(id, actorSite);
    await this.refuseProtected(id, actorId, 'Resetting the password for');
    // Same reasoning as deactivation: a new password ends every session on
    // every brand, so it is not one dashboard's to force on another.
    await this.requireWhollyWithin(id, actorSite, 'Resetting the password for');
    const admin = await this.requireAdmin(id);

    const temporaryPassword = randomBytes(24).toString('base64url');
    await this.adminRepo.update(
      { id },
      { passwordHash: await argon2.hash(temporaryPassword, ARGON2_OPTIONS) },
    );

    const revoked = await this.revokeSessions(id);
    this.logger.log(
      `Password reset for ${admin.email} by ${actorId}; revoked ${revoked} session(s)`,
    );

    const roleMap = await this.rolesFor([id]);
    return {
      ...this.toStaffMember(admin, roleMap),
      temporaryPassword,
      passwordNotice: PASSWORD_NOTICE,
    };
  }

  // ------------------------------------------------------------- internals

  private async requireAdmin(id: string): Promise<Admin> {
    const admin = await this.adminRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!admin) throw new NotFoundException('No such staff account');
    return admin;
  }

  private async requireRolesExist(roleCodes: number[]): Promise<void> {
    const found = await this.roleRepo.find({
      where: { roleCode: In(roleCodes), isActive: true },
    });
    const known = new Set(found.map((r) => r.roleCode));
    const unknown = roleCodes.filter((code) => !known.has(code));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown or inactive role code(s): ${unknown.join(', ')}`,
      );
    }
  }

  /**
   * Blocks acting on your own account.
   *
   * Covers self-escalation and self-lockout with one rule, and removes the
   * question of whether a super admin may quietly widen their own access —
   * a second super admin has to do it, which leaves two names in the trail.
   */
  private refuseSelf(targetId: string, actorId: string, action: string): void {
    if (targetId === actorId) {
      throw new ForbiddenException(
        `You cannot ${action}. Ask another super admin to do it.`,
      );
    }
  }

  private async requireSiteExists(siteCode: number): Promise<void> {
    const site = await this.siteRepo.findOne({
      where: { siteCode, isActive: true, isDeleted: false },
    });
    if (!site) {
      throw new BadRequestException(
        `Unknown or inactive site code: ${siteCode}`,
      );
    }
  }

  /**
   * Refuses to remove the last way back in — **per brand**.
   *
   * Each dashboard needs its own super admin, so this counts only the site
   * being changed. Being super admin on IT is no help at all when nobody can
   * administer cranes, and the only route back would be a database session,
   * which is precisely what this module exists to avoid needing.
   *
   * `siteCode` of undefined means "any site" — used when deactivating a whole
   * account, which would strip that person from every brand at once.
   */
  private async refuseLastSuperAdmin(
    targetId: string,
    siteCode: number | undefined,
    action: string,
  ): Promise<void> {
    const superBadges = await this.adminRoleRepo.find({
      where: {
        adminId: targetId,
        roleCode: ROLE.SUPER_ADMIN,
        revokedAt: IsNull(),
        ...(siteCode !== undefined ? { siteCode } : {}),
      },
    });
    if (superBadges.length === 0) return;

    for (const badge of superBadges) {
      const others = await this.adminRoleRepo
        .createQueryBuilder('ar')
        .innerJoin(Admin, 'admin', 'admin.id = ar.admin_id')
        .where('ar.role_code = :code', { code: ROLE.SUPER_ADMIN })
        .andWhere('ar.site_code = :site', { site: badge.siteCode })
        .andWhere('ar.revoked_at IS NULL')
        .andWhere('ar.admin_id != :targetId', { targetId })
        .andWhere('admin.is_active = true')
        .andWhere('admin.is_deleted = false')
        .getCount();

      if (others === 0) {
        const site = await this.siteRepo.findOne({
          where: { siteCode: badge.siteCode },
        });
        throw new ConflictException(
          `${action} this account would leave ${site?.siteName ?? `site ${badge.siteCode}`} ` +
            `with no active super admin. Promote someone else there first.`,
        );
      }
    }
  }

  /**
   * The dashboard an action names must be the one the caller signed in to.
   *
   * `role_permissions` has no site column, so SUPER_ADMIN holds the staff
   * feature on every dashboard it can reach. This is what stops a super
   * admin for one brand minting a super admin for another.
   */
  /**
   * A protected account may only be changed by another protected account.
   *
   * The root holds a badge on every brand, so it appears on every unit admin's
   * staff list and would otherwise be theirs to revoke, deactivate or reset
   * like anyone else on their dashboard — the last-super-admin guard stops
   * covering it the moment a unit gains a second super admin.
   *
   * Reads are untouched: a unit admin still SEES the root on their list.
   * Hiding it would only make the refusal confusing when they tried.
   */
  private async refuseProtected(
    targetId: string,
    actorId: string,
    action: string,
  ): Promise<void> {
    const [target, actor] = await Promise.all([
      this.adminRepo.findOne({
        where: { id: targetId },
        select: ['id', 'isProtected'],
      }),
      this.adminRepo.findOne({
        where: { id: actorId },
        select: ['id', 'isProtected'],
      }),
    ]);

    if (target?.isProtected && !actor?.isProtected) {
      throw new ForbiddenException(
        `${action} this account is not something a unit administrator can do. ` +
          'It belongs to the organisation, not to one dashboard.',
      );
    }
  }

  private requireOwnSite(siteCode: number, actorSite: number): void {
    if (siteCode !== actorSite) {
      throw new ForbiddenException(
        'You can only manage roles on the dashboard you are signed in to.',
      );
    }
  }

  /**
   * 404 rather than 403 for an account on another brand — from this
   * dashboard it genuinely does not exist, and saying otherwise would
   * confirm the email is in use somewhere.
   */
  private async requireVisible(id: string, actorSite: number): Promise<void> {
    const held = await this.adminRoleRepo.count({
      where: { adminId: id, siteCode: actorSite, revokedAt: IsNull() },
    });
    if (held === 0) {
      throw new NotFoundException(`Staff member ${id} not found`);
    }
  }

  /**
   * For the account-level actions — deactivation and password reset —
   * which end sessions on every brand at once.
   *
   * The consequence worth knowing: an account with badges on two
   * dashboards cannot be fully offboarded from either one alone. Whoever
   * runs the other brand revokes their side first, or someone holding both
   * badges does it. That is the isolation working, not a gap.
   */
  private async requireWhollyWithin(
    id: string,
    actorSite: number,
    action: string,
  ): Promise<void> {
    const elsewhere = await this.adminRoleRepo.count({
      where: { adminId: id, siteCode: Not(actorSite), revokedAt: IsNull() },
    });
    if (elsewhere > 0) {
      throw new ForbiddenException(
        `${action} this account would affect dashboards you do not ` +
          'administer. Revoke its roles on this dashboard instead.',
      );
    }
  }

  private async revokeSessions(adminId: string): Promise<number> {
    const result = await this.refreshRepo.update(
      { subjectId: adminId, subjectType: 'admin', revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return result.affected ?? 0;
  }

  /** Live role assignments for several admins at once, keyed by admin id. */
  private async rolesFor(
    adminIds: string[],
  ): Promise<Map<string, StaffRole[]>> {
    const map = new Map<string, StaffRole[]>();
    if (adminIds.length === 0) return map;

    const rows = await this.adminRoleRepo.find({
      where: { adminId: In(adminIds), revokedAt: IsNull() },
      relations: { role: true, site: true },
    });

    for (const row of rows) {
      const list = map.get(row.adminId) ?? [];
      list.push({
        code: row.roleCode,
        name: row.role?.roleName ?? String(row.roleCode),
        siteCode: row.siteCode,
        siteName: row.site?.siteName ?? String(row.siteCode),
        assignedAt: row.assignedDate,
      });
      map.set(row.adminId, list);
    }

    // Grouped by brand first — that's how a person's access reads: what they
    // do on IT, then what they do on cranes.
    for (const list of map.values()) {
      list.sort((a, b) => a.siteCode - b.siteCode || a.code - b.code);
    }
    return map;
  }

  private toStaffMember(
    admin: Admin,
    roleMap: Map<string, StaffRole[]>,
  ): StaffMember {
    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      isActive: admin.isActive,
      lastLoginAt: admin.lastLoginAt,
      createdDate: admin.createdDate,
      roles: roleMap.get(admin.id) ?? [],
    };
  }
}
