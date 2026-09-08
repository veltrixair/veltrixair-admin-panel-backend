import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { SiteMaster } from '../master-data/entities/site-master.entity';
import { Admin } from './entities/admin.entity';
import { AdminRole } from './entities/admin-role.entity';
import { FeatureMaster } from './entities/feature-master.entity';
import { PermissionMaster } from './entities/permission-master.entity';
import { RoleMaster } from './entities/role-master.entity';
import { RolePermission } from './entities/role-permission.entity';
import { ROLE } from './permissions.constants';

export interface ResolvedPermission {
  feature: string;
  permission: string;
  featureCode: number;
  permissionCode: number;
}

/**
 * Resolves what an admin may do, on one site, acting as one role.
 *
 * Every check is two questions, not one:
 *
 *   1. Is there still a live badge for (admin, role, site)?
 *   2. Does that role carry this permission?
 *
 * Question 1 is what keeps revocation immediate. The site and role are signed
 * into the token, so they cannot be tampered with — but a signed claim only
 * proves what was true at sign-in. Re-checking the badge is what makes
 * "revoked at 10:00" mean revoked at 10:00, rather than up to fifteen minutes
 * later when the access token happens to expire.
 */
@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    @InjectRepository(AdminRole)
    private readonly adminRoleRepo: Repository<AdminRole>,
    @InjectRepository(RolePermission)
    private readonly rolePermRepo: Repository<RolePermission>,
    @InjectRepository(FeatureMaster)
    private readonly featureRepo: Repository<FeatureMaster>,
    @InjectRepository(PermissionMaster)
    private readonly permissionRepo: Repository<PermissionMaster>,
    @InjectRepository(SiteMaster)
    private readonly siteRepo: Repository<SiteMaster>,
    @InjectRepository(RoleMaster)
    private readonly roleRepo: Repository<RoleMaster>,
  ) {}

  async hasAdminPermission(
    adminId: string,
    siteCode: number,
    roleCode: number,
    featureCode: number,
    permissionCode: number,
  ): Promise<boolean> {
    if (!(await this.holdsBadge(adminId, siteCode, roleCode))) return false;

    /*
     * The view, not the table.
     *
     * A unit can narrow or widen what a role does on its own dashboard, so the
     * answer depends on where the question is asked. Reading the raw table
     * here would enforce the seeded definition while the screen showed the
     * overridden one — a guard and a nav that disagree, which is worse than
     * either being wrong on its own.
     */
    const rows: unknown[] = await this.rolePermRepo.query(
      `SELECT 1 FROM "effective_role_permissions"
        WHERE "site_code" = $1 AND "role_code" = $2
          AND "feature_code" = $3 AND "permission_code" = $4
        LIMIT 1`,
      [siteCode, roleCode, featureCode, permissionCode],
    );

    return rows.length > 0;
  }

  /**
   * Is this account still holding a password it did not choose?
   *
   * Read from the table on every request, like the badge check beside it — the
   * flag clears mid-session the moment the password is changed, and a token
   * signed before that must not keep asserting the old answer.
   */
  async mustChangePassword(adminId: string): Promise<boolean> {
    const admin = await this.adminRepo.findOne({
      where: { id: adminId, isDeleted: false },
      select: ['id', 'mustChangePassword'],
    });
    return admin?.mustChangePassword ?? false;
  }

  /** Is this badge still in force? Nothing downstream is trusted without it. */
  async holdsBadge(
    adminId: string,
    siteCode: number,
    roleCode: number,
  ): Promise<boolean> {
    const badge = await this.adminRoleRepo.findOne({
      where: { adminId, siteCode, roleCode, revokedAt: IsNull() },
      select: ['id'],
    });
    return !!badge;
  }

  /** Every badge a person holds, across all brands — powers the sign-in screen. */
  listBadges(adminId: string): Promise<AdminRole[]> {
    return this.adminRoleRepo.find({
      where: { adminId, revokedAt: IsNull() },
      relations: { role: true, site: true },
      order: { siteCode: 'ASC', roleCode: 'ASC' },
    });
  }

  /**
   * What this session may do — one role on one site. Powers the admin UI's
   * menu; the guard still enforces it server-side regardless.
   */
  async listSessionPermissions(
    roleCode: number,
    siteCode: number,
  ): Promise<ResolvedPermission[]> {
    /*
     * Site-scoped, because the same role can mean different things on two
     * dashboards. This is what the client draws its menu from, so it has to
     * be the same set the guard will enforce.
     */
    const [grants, features, permissions] = await Promise.all([
      this.rolePermRepo.query(
        `SELECT "feature_code" AS "featureCode",
                "permission_code" AS "permissionCode"
           FROM "effective_role_permissions"
          WHERE "site_code" = $1 AND "role_code" = $2`,
        [siteCode, roleCode],
      ) as Promise<{ featureCode: number; permissionCode: number }[]>,
      this.featureRepo.find(),
      this.permissionRepo.find(),
    ]);

    const featureName = new Map(
      features.map((f) => [f.featureCode, f.featureName]),
    );
    const permissionName = new Map(
      permissions.map((p) => [p.permissionCode, p.permissionName]),
    );

    return grants
      .map((g) => ({
        feature: featureName.get(g.featureCode) ?? String(g.featureCode),
        permission:
          permissionName.get(g.permissionCode) ?? String(g.permissionCode),
        featureCode: g.featureCode,
        permissionCode: g.permissionCode,
      }))
      .sort(
        (a, b) =>
          a.featureCode - b.featureCode || a.permissionCode - b.permissionCode,
      );
  }

  findSite(siteCode: number): Promise<SiteMaster | null> {
    return this.siteRepo.findOne({
      where: { siteCode, isActive: true, isDeleted: false },
    });
  }

  listSites(): Promise<SiteMaster[]> {
    return this.siteRepo.find({
      where: { isActive: true, isDeleted: false },
      order: { displayOrder: 'ASC' },
    });
  }

  /**
   * Roles the sign-in screen may offer.
   *
   * Roles with no permissions are excluded, because a picker that lists one is
   * offering a session that can reach nothing. PENDING is excluded by the same
   * rule and now also refused outright by resolveScope, so listing it would
   * only ever produce a 403.
   *
   * That is safe for anything created now: granting access requires a real
   * role, so PENDING cannot be reached. Accounts still holding it from before
   * are moved off it by replacing their roles under Team & roles.
   */
  async listAssignableRoles(): Promise<{ code: number; name: string }[]> {
    const grants = await this.rolePermRepo.find({ select: ['roleCode'] });
    const withGrants = new Set(grants.map((g) => g.roleCode));

    const roles = await this.roleRepo.find({
      where: { isActive: true },
      order: { roleCode: 'ASC' },
    });

    return roles
      .filter((r) => withGrants.has(r.roleCode) && r.roleCode !== ROLE.PENDING)
      .map((r) => ({ code: r.roleCode, name: r.roleName }));
  }

  /** Used by the staff module to validate a code before assigning it. */
  roleCodesIn(roleCodes: number[]): Promise<RolePermission[]> {
    return this.rolePermRepo.find({ where: { roleCode: In(roleCodes) } });
  }
}
