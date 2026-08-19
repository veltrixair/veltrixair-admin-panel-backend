import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { SiteMaster } from '../master-data/entities/site-master.entity';
import { AdminRole } from './entities/admin-role.entity';
import { FeatureMaster } from './entities/feature-master.entity';
import { PermissionMaster } from './entities/permission-master.entity';
import { RoleMaster } from './entities/role-master.entity';
import { RolePermission } from './entities/role-permission.entity';

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

    const grant = await this.rolePermRepo.findOne({
      where: { roleCode, featureCode, permissionCode },
      select: ['id'],
    });

    return !!grant;
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
  ): Promise<ResolvedPermission[]> {
    const [grants, features, permissions] = await Promise.all([
      this.rolePermRepo.find({ where: { roleCode } }),
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

  /** Roles that actually have at least one permission — the sign-in dropdown. */
  async listAssignableRoles(): Promise<{ code: number; name: string }[]> {
    const grants = await this.rolePermRepo.find({ select: ['roleCode'] });
    const withGrants = new Set(grants.map((g) => g.roleCode));

    const roles = await this.roleRepo.find({
      where: { isActive: true },
      order: { roleCode: 'ASC' },
    });

    return roles
      .filter((r) => withGrants.has(r.roleCode))
      .map((r) => ({ code: r.roleCode, name: r.roleName }));
  }

  /** Used by the staff module to validate a code before assigning it. */
  roleCodesIn(roleCodes: number[]): Promise<RolePermission[]> {
    return this.rolePermRepo.find({ where: { roleCode: In(roleCodes) } });
  }
}
