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
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { ListStaffDto } from './dto/list-staff.dto';
import { CreateStaffDto, UpdateStaffDto } from './dto/upsert-staff.dto';
import { AdminRole } from './entities/admin-role.entity';
import { Employee } from '../hr/entities/employee.entity';
import { Admin } from './entities/admin.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RoleMaster } from './entities/role-master.entity';
import { RolePermission } from './entities/role-permission.entity';
import { DepartmentMaster } from '../master-data/entities/department-master.entity';
import { OfficeMaster } from '../master-data/entities/office-master.entity';
import { SiteMaster } from '../master-data/entities/site-master.entity';
import { NotificationService } from '../notifications/notification.service';
import { MailService } from '../mail/mail.service';
import { ARGON2_OPTIONS } from './password.constants';
import { FEATURE, PERMISSION, ROLE } from './permissions.constants';

/** One badge: a role held on one brand. */
export interface StaffRole {
  code: number;
  name: string;
  siteCode: number;
  siteName: string;
  assignedAt: Date;
}

/**
 * Where an account is in its life, worked out rather than stored.
 *
 * A stored status would be a fourth thing to keep in step with the three
 * columns that already say it, and the first to drift.
 */
export type StaffStatus = 'PENDING' | 'INVITED' | 'ACTIVE' | 'DISABLED';

export interface StaffProfile {
  employeeCode: string;
  designation: string;
  /**
   * Their work mobile, from the same employee record as the designation.
   *
   * This was deliberately withheld once, on the reasoning that a number is
   * the person's own. It does not hold: it is the work number already shown
   * on their onboarding record, and the account screen that needs it exists
   * to let an admin check they are granting a login to the right colleague.
   * Withholding it only meant the field rendered "Not on record" for
   * everybody, which reads as missing data rather than as a policy.
   */
  mobile: string | null;
  department: { code: number; name: string } | null;
  employmentType: string;
  officeCode: number | null;
  joiningDate: string | null;
  reportingTo: string | null;
}

/** A colleague who can be handed a record. Name and address, nothing else. */
export interface AssignableStaff {
  id: string;
  fullName: string;
  email: string;
}

export interface StaffMember {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  status: StaffStatus;
  invitedAt: Date | null;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdDate: Date;
  roles: StaffRole[];
  /**
   * The person behind the login.
   *
   * Null for the four service accounts, which are credentials rather than
   * people. Everyone else is an employee first; this is a read-through, and
   * the employee record is edited in the HR module.
   */
  profile: StaffProfile | null;
}

/** What the onboarding form renders its dropdowns from. */
export interface StaffOptions {
  departments: { code: number; name: string }[];
  offices: { code: number; name: string; city: string; country: string }[];
  employmentTypes: string[];
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
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(DepartmentMaster)
    private readonly departmentRepo: Repository<DepartmentMaster>,
    @InjectRepository(OfficeMaster)
    private readonly officeRepo: Repository<OfficeMaster>,
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    @InjectRepository(RoleMaster)
    private readonly roleRepo: Repository<RoleMaster>,
    @InjectRepository(RolePermission)
    private readonly rolePermRepo: Repository<RolePermission>,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
    @InjectRepository(SiteMaster)
    private readonly siteRepo: Repository<SiteMaster>,
    // NotificationsModule is @Global, so this needs no import here.
    private readonly notifications: NotificationService,
  ) {}

  // -------------------------------------------------------------- reading

  async list(
    query: ListStaffDto,
    actorSite: number,
    actorId?: string,
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

    /*
     * And not the organisation's own account.
     *
     * The root holds a badge on every brand, so the check above finds it on
     * all three dashboards — it appeared in every unit administrator's list of
     * colleagues. Excluded here rather than filtered in the client, so the
     * pagination count is right and no request can ask for it.
     *
     * A protected caller still sees everyone, themselves included: this hides
     * the account from the units, not from the people who hold it.
     */
    if (actorId) {
      qb.andWhere(
        `(admin.is_protected = false OR EXISTS (
             SELECT 1 FROM admins me
              WHERE me.id = :actorId AND me.is_protected = true
           ))`,
        { actorId },
      );
    }

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

    // One query each for every listed admin's roles and profile, rather than
    // two per row.
    const ids = admins.map((a) => a.id);
    const [roleMap, profileMap] = await Promise.all([
      this.rolesFor(ids),
      this.profilesFor(ids),
    ]);

    return {
      items: admins.map((admin) =>
        this.toStaffMember(admin, roleMap, profileMap),
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /** For the caller — refuses accounts that are not on their dashboard. */
  async view(id: string, actorSite: number, actorId?: string): Promise<StaffMember> {
    await this.requireVisible(id, actorSite, actorId);
    return this.findById(id);
  }

  /** Internal: shapes a record without a visibility check. */
  async findById(id: string): Promise<StaffMember> {
    const admin = await this.requireAdmin(id);
    const [roleMap, profileMap] = await Promise.all([
      this.rolesFor([id]),
      this.profilesFor([id]),
    ]);
    return this.toStaffMember(admin, roleMap, profileMap);
  }

  /**
   * Everything the onboarding form needs to render its dropdowns.
   *
   * Offices are bound to the caller's dashboard; departments are not, because
   * a department is a company-wide fact and the same person may work for one
   * while holding badges on several brands.
   *
   * `offices` can legitimately come back empty — `office_masters` holds
   * nothing for Industries yet, so a crane colleague has no desk to be
   * assigned to. The field is nullable for exactly that reason.
   */
  /**
   * Roles and what each one grants **on this dashboard**.
   *
   * Site-scoped, because a unit can now change what a role does without
   * changing what it means everywhere. Reads the same view the guard does, so
   * the matrix on screen is the set that will actually be enforced.
   *
   * `isDefault` travels with each grant so the screen can show which entries
   * this unit has changed, and offer to put them back.
   */
  async listRoles(siteCode: number): Promise<
    {
      code: number;
      name: string;
      description: string | null;
      permissions: {
        featureCode: number;
        permissionCode: number;
        isDefault: boolean;
      }[];
    }[]
  > {
    const [roles, grants, defaults] = await Promise.all([
      this.roleRepo.find({
        where: { isActive: true },
        order: { roleCode: 'ASC' },
      }),
      this.rolePermRepo.query(
        `SELECT "role_code" AS "roleCode",
                "feature_code" AS "featureCode",
                "permission_code" AS "permissionCode"
           FROM "effective_role_permissions"
          WHERE "site_code" = $1`,
        [siteCode],
      ) as Promise<
        { roleCode: number; featureCode: number; permissionCode: number }[]
      >,
      this.rolePermRepo.find(),
    ]);

    const isSeeded = new Set(
      defaults.map((d) => `${d.roleCode}:${d.featureCode}:${d.permissionCode}`),
    );

    return roles.map((role) => ({
      code: role.roleCode,
      name: role.roleName,
      description: role.description,
      permissions: grants
        .filter((g) => g.roleCode === role.roleCode)
        .map((g) => ({
          featureCode: g.featureCode,
          permissionCode: g.permissionCode,
          isDefault: isSeeded.has(
            `${g.roleCode}:${g.featureCode}:${g.permissionCode}`,
          ),
        }))
        .sort(
          (a, b) =>
            a.featureCode - b.featureCode ||
            a.permissionCode - b.permissionCode,
        ),
    }));
  }

  // -------------------------------------------------------------- creating

  /**
   * Onboard someone. Creates the account and its profile; does NOT let them in.
   *
   * A password and a real role are both required, so the account is usable the
   * moment it exists. This used to be half of the job, with an invitation
   * issuing the credential later — which left accounts that read as finished
   * in the staff list and could not be signed in to. Re-issuing a password
   * afterwards is `resetPassword`.
   *
   * Both rows go in one transaction. An account without its profile would be a
   * person with no name, department or employee code, and the profile is
   * where every one of those lives now.
   */
  async create(
    dto: CreateStaffDto,
    actorId: string,
    actorSite: number,
  ): Promise<StaffMember> {
    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employeeId, isDeleted: false },
    });
    if (!employee) {
      throw new NotFoundException('No such employee');
    }

    /*
     * Somebody who has left, or never started.
     *
     * The picker already leaves them out; this refuses it for every other
     * caller too. A filtered dropdown is a convenience, not a rule — the rule
     * has to live where the account is actually made.
     */
    if (!employee.isActive) {
      throw new BadRequestException(
        `${employee.fullName} is not an active employee. ` +
          'Reactivate their record before granting a login.',
      );
    }

    // One login per person. A second account for somebody who already has one
    // would split their roles across two identities and make "who can reach
    // this?" unanswerable.
    const already = await this.adminRepo.findOne({
      where: { employeeId: employee.id },
      withDeleted: true,
    });
    if (already) {
      throw new ConflictException(
        `${employee.fullName} already has an account (${already.email})`,
      );
    }

    const email = employee.workEmail.trim().toLowerCase();
    const existing = await this.adminRepo.findOne({
      where: { email },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException(`${email} already has an account`);
    }

    const roleCodes = dto.roleCodes?.length ? dto.roleCodes : [ROLE.PENDING];
    await this.requireProtectedToGrantSuperAdmin(actorId, roleCodes);
    await this.requireRolesExist(roleCodes);

    /*
     * A working credential may not exist on an account whose job nobody has
     * decided — the same rule the invitation path enforces, for the same
     * reason. Since a password is now always set, this makes a real role
     * required too: an account cannot be created on the PENDING placeholder.
     */
    if (roleCodes.includes(ROLE.PENDING)) {
      throw new BadRequestException(
        'Choose the role this person is being hired into before setting a ' +
          'password. PENDING is a placeholder, not a role.',
      );
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const admin = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(Admin, {
          employeeId: employee.id,
          email,
          // Copied, not joined: the sign-in and audit paths read a name
          // constantly and must not have to reach into another table for it.
          fullName: employee.fullName,
          /*
           * invitedAt is stamped alongside the password because the account
           * has been handed over: a later invitation must treat it as a
           * re-issue rather than a first one, and refuse without `resend`.
           */
          passwordHash,
          invitedAt: new Date(),
          mustChangePassword: false,
          createdBy: actorId,
        }),
      );

      await manager.save(
        roleCodes.map((roleCode) =>
          manager.create(AdminRole, {
            adminId: saved.id,
            roleCode,
            siteCode: actorSite,
            assignedBy: actorId,
          }),
        ),
      );

      return saved;
    });

    this.logger.log(
      `Access granted to ${email} on site ${actorSite} by ${actorId} ` +
        `(roles ${roleCodes.join(', ')}) — password set by the administrator`,
    );

    if (dto.sendPasswordEmail) {
      await this.mailPassword(email, employee.fullName, dto.password, actorSite);
    }

    await this.announce(
      actorId,
      actorSite,
      'New user added',
      `${employee.fullName} · ${email}`,
      admin.id,
    );

    return this.findById(admin.id);
  }


  /**
   * VTX-EMP-0001, from a sequence rather than a count.
   *
   * A count would reissue a code after somebody is deleted, and an employee
   * code appears in records this system does not own.
   */
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

    // Department, designation, joining date and the rest belong to the
    // employee now and are edited in the HR module. This changes the account.

    // Deactivation has to end the sessions, not just block future logins —
    // otherwise an offboarded account keeps working until its refresh token
    // expires, which is up to a week.
    if (dto.isActive === false) {
      await this.announce(
        actorId,
        actorSite,
        'Account deactivated',
        `${admin.fullName} · ${admin.email} can no longer sign in`,
        id,
      );

      const revoked = await this.revokeSessions(id);
      this.logger.log(
        `Deactivated ${admin.email} by ${actorId}; revoked ${revoked} session(s)`,
      );
    }

    return this.findById(id);
  }

  /**
   * Announce something that happened to an account.
   *
   * Gated on FEATURE.ADMINS, because the audience for "somebody's access
   * changed" is exactly the people who could have changed it themselves.
   * `actorAdminId` keeps it away from whoever did it — they already know.
   */
  /** A code is not a label, and the feed is read by people. */
  private async roleName(roleCode: number): Promise<string> {
    const role = await this.roleRepo.findOne({ where: { roleCode } });
    return role?.roleName ?? String(roleCode);
  }

  private announce(
    actorId: string,
    siteCode: number,
    lead: string,
    body: string,
    staffId: string,
  ): Promise<void> {
    return this.notifications.raise({
      siteCode,
      featureCode: FEATURE.ADMINS,
      category: 'system',
      lead,
      body,
      link: `/profile/users/${staffId}`,
      sourceType: 'staff_account',
      sourceId: staffId,
      actorAdminId: actorId,
    });
  }

  /**
   * Change what a role may do, on this dashboard only.
   *
   * Stored as differences from the seeded definition, so the defaults survive
   * and "reset" is a delete rather than a restore. Both directions are
   * allowed: a unit can take a permission away or add one the role never had.
   *
   * Three refusals, and each closes a door that has no key on the other side:
   *
   *   - Nobody edits their own role. Removing your own ADMINS access is a
   *     lockout you cannot undo, because undoing it needs the access you just
   *     removed.
   *   - SUPER_ADMIN keeps ADMINS everywhere. If it could be taken away, one
   *     click could leave a dashboard with nobody able to administer it, and
   *     the only route back would be a migration.
   *   - Only a real role, never PENDING. It grants nothing by design.
   */
  async setRolePermissions(
    roleCode: number,
    grants: { featureCode: number; permissionCode: number }[],
    actorId: string,
    actorSite: number,
    actorRole: number,
  ): Promise<void> {
    if (roleCode === actorRole) {
      throw new ForbiddenException(
        'You cannot change the permissions of the role you are signed in as. ' +
          'Ask another Super Admin to do it.',
      );
    }
    if (roleCode === ROLE.PENDING) {
      throw new BadRequestException(
        'PENDING is a placeholder and grants nothing — there is nothing to change.',
      );
    }
    await this.requireRolesExist([roleCode]);

    const wanted = new Set(
      grants.map((g) => `${g.featureCode}:${g.permissionCode}`),
    );

    if (
      roleCode === ROLE.SUPER_ADMIN &&
      !wanted.has(`${FEATURE.ADMINS}:${PERMISSION.VIEW}`)
    ) {
      throw new BadRequestException(
        'Super Admin must keep access to Team & roles — removing it would ' +
          'leave this dashboard with nobody able to administer it.',
      );
    }

    // The seeded definition, which the overrides are differences from.
    const defaults = await this.rolePermRepo.find({ where: { roleCode } });
    const isDefault = new Set(
      defaults.map((d) => `${d.featureCode}:${d.permissionCode}`),
    );

    // Everything either side mentions, so a permission dropped from both the
    // defaults and the request still has its override cleared.
    const touched = new Set([...wanted, ...isDefault]);

    await this.rolePermRepo.manager.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM "role_permission_overrides"
          WHERE "site_code" = $1 AND "role_code" = $2`,
        [actorSite, roleCode],
      );

      for (const key of touched) {
        const [featureCode, permissionCode] = key.split(':').map(Number);
        const want = wanted.has(key);
        const seeded = isDefault.has(key);
        // Agreeing with the default needs no row — that is what a default is.
        if (want === seeded) continue;

        await manager.query(
          `INSERT INTO "role_permission_overrides"
             ("site_code","role_code","feature_code","permission_code","granted","created_by")
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [actorSite, roleCode, featureCode, permissionCode, want, actorId],
        );

        await manager.query(
          `INSERT INTO "role_permission_audit"
             ("site_code","role_code","feature_code","permission_code","granted","actor_admin_id")
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [actorSite, roleCode, featureCode, permissionCode, want, actorId],
        );
      }
    });

    this.logger.log(
      `Role ${roleCode} permissions set on site ${actorSite} by ${actorId} ` +
        `(${grants.length} grant(s))`,
    );
  }

  /** Put a role back to its seeded definition on this dashboard. */
  async resetRolePermissions(
    roleCode: number,
    actorId: string,
    actorSite: number,
    actorRole: number,
  ): Promise<void> {
    if (roleCode === actorRole) {
      throw new ForbiddenException(
        'You cannot change the permissions of the role you are signed in as.',
      );
    }

    await this.rolePermRepo.manager.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM "role_permission_overrides"
          WHERE "site_code" = $1 AND "role_code" = $2`,
        [actorSite, roleCode],
      );
      // granted NULL reads as "back to the default" in the trail.
      await manager.query(
        `INSERT INTO "role_permission_audit"
           ("site_code","role_code","feature_code","permission_code","granted","actor_admin_id")
         VALUES ($1,$2,0,0,NULL,$3)`,
        [actorSite, roleCode, actorId],
      );
    });

    this.logger.log(
      `Role ${roleCode} reset to defaults on site ${actorSite} by ${actorId}`,
    );
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
    await this.requireProtectedToGrantSuperAdmin(actorId, [roleCode]);
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

      const staff = await this.findById(id);
      await this.announce(
        actorId,
        siteCode,
        'Role granted',
        `${staff.fullName} · ${await this.roleName(roleCode)}`,
        id,
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
    await this.refuseRevokingProtected(id);

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

      const staff = await this.findById(id);
      await this.announce(
        actorId,
        siteCode,
        'Role revoked',
        `${staff.fullName} · ${await this.roleName(roleCode)}`,
        id,
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
    await this.requireProtectedToGrantSuperAdmin(actorId, roleCodes);
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

    // Same rule as revokeRole, and it has to be here too: this route removes
    // badges by omission, so leaving 101 out of the list is a revocation
    // wearing a different shape.
    if (removing.length > 0) {
      await this.refuseRevokingProtected(id);
    }

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

    // Only when something actually moved — a save that changed nothing is not
    // an event, and announcing it would fill the feed with non-news.
    if (adding.length || removing.length) {
      const staff = await this.findById(id);
      const names = await Promise.all(roleCodes.map((c) => this.roleName(c)));
      await this.announce(
        actorId,
        siteCode,
        'Roles changed',
        `${staff.fullName} · now ${names.join(', ')}`,
        id,
      );
    }

    return this.findById(id);
  }

  /** The history, including revoked assignments — this is the audit trail. */
  async listRoleHistory(
    id: string,
    actorSite: number,
    actorId?: string,
  ): Promise<AdminRole[]> {
    await this.requireVisible(id, actorSite, actorId);
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

  /**
   * Set an account's password to one an administrator chose.
   *
   * The counterpart to `resetPassword`, and deliberately not the same thing.
   * A reset mints a random credential nobody chose and forces a change at next
   * sign-in, because the holder never picked it. Here an administrator picks
   * it and hands it over in person, so it is theirs to keep.
   *
   * The password is never returned: the caller already has it, and echoing a
   * live credential into a response body puts it somewhere it does not need
   * to be.
   */
  async setPassword(
    id: string,
    password: string,
    sendEmail: boolean,
    actorId: string,
    actorSite: number,
  ): Promise<StaffMember> {
    await this.requireVisible(id, actorSite);
    await this.refuseProtected(id, actorId, 'Setting the password for');
    // A password is one credential across every brand, so it is not one
    // dashboard's to change on behalf of another.
    await this.requireWhollyWithin(id, actorSite, 'Setting the password for');
    const admin = await this.requireAdmin(id);

    await this.adminRepo.update(
      { id },
      {
        passwordHash: await argon2.hash(password, ARGON2_OPTIONS),
        // Chosen for them, but handed over deliberately rather than mailed as
        // a temporary secret — so they are not made to change it.
        mustChangePassword: false,
        // An account that had never been invited has now been handed over.
        ...(admin.invitedAt ? {} : { invitedAt: new Date() }),
      },
    );

    const revoked = await this.revokeSessions(id);
    this.logger.log(
      `Password set for ${admin.email} by ${actorId}; revoked ${revoked} session(s)`,
    );

    if (sendEmail) {
      await this.mailPassword(admin.email, admin.fullName, password, actorSite);
    }

    await this.announce(
      actorId,
      actorSite,
      'Password set by an administrator',
      `${admin.fullName} · every session ended`,
      id,
    );

    return this.findById(id);
  }

  /**
   * Send somebody the password an administrator chose for them.
   *
   * Sent only when asked for. A password in an inbox outlives the conversation
   * it was agreed in, so handing it over in person is the better default and
   * this is the exception.
   */
  private async mailPassword(
    to: string,
    fullName: string,
    password: string,
    siteCode: number,
  ): Promise<void> {
    const site = await this.siteRepo.findOne({ where: { siteCode } });
    const dashboard = site?.siteName ?? 'the Veltrixair admin panel';

    await this.mail.send({
      to,
      subject: 'Your Veltrixair admin password',
      body:
        `Hello ${fullName},

` +
        `An administrator has set the password for your ${dashboard} account.

` +
        `Email:    ${to}
` +
        `Password: ${password}

` +
        `You can sign in${site?.adminDomain ? ` at ${site.adminDomain}` : ''} straight away.

` +
        `If you did not expect this, tell your administrator — anyone holding ` +
        `this message can sign in as you until the password is changed.
`,
    });
  }

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
      {
        passwordHash: await argon2.hash(temporaryPassword, ARGON2_OPTIONS),
        // Someone else chose this one, so it is not theirs to keep.
        mustChangePassword: true,
      },
    );

    const revoked = await this.revokeSessions(id);
    this.logger.log(
      `Password reset for ${admin.email} by ${actorId}; revoked ${revoked} session(s)`,
    );

    return {
      ...(await this.findById(id)),
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
  /**
   * Only a protected account may hand out SUPER_ADMIN.
   *
   * Without this, a unit admin can create their own peers: SUPER_ADMIN is one
   * role, and holding it on one dashboard carries the same authority over that
   * dashboard as holding it on three. So the admin for Industries could mint a
   * second Industries admin, who could mint a third, and revoke the first —
   * the last-super-admin guard only refuses removing the *final* one, and by
   * then there are several.
   *
   * `is_protected` is the only rank the system has, and it already means
   * "outranks a unit administrator". Reusing it keeps one concept rather than
   * inventing a second. It also leaves a deliberate way to nominate a deputy:
   * mark a second account protected and two people can appoint admins, which
   * matters because otherwise losing the root leaves no in-app way back.
   *
   * Note what this does NOT restrict. A protected account granting 101 still
   * only grants it on the dashboard it is signed in to, so the result is a
   * unit admin for one brand. Making someone a super admin everywhere takes
   * three deliberate grants on three dashboards.
   */
  private async requireProtectedToGrantSuperAdmin(
    actorId: string,
    roleCodes: number[],
  ): Promise<void> {
    if (!roleCodes.includes(ROLE.SUPER_ADMIN)) return;

    const actor = await this.adminRepo.findOne({
      where: { id: actorId },
      select: ['id', 'isProtected'],
    });

    if (!actor?.isProtected) {
      throw new ForbiddenException(
        'Only the organisation-level administrator can make someone a super ' +
          'administrator. Assign one of the other roles, or ask them to do it.',
      );
    }
  }

  /**
   * The global super administrator's badges are nobody's to remove.
   *
   * Stronger than `refuseProtected`, which only stops a *unit* admin: this
   * refuses everyone, protected callers included. The account holds a badge on
   * every brand, so stripping one is how you would quietly amputate the only
   * authority that spans them — and the last-super-admin guard would not
   * object, because each dashboard still has its own.
   *
   * Deactivating the account, or deleting the row directly, remain possible.
   * This is not a vault; it is a rule that a routine screen cannot break.
   */
  private async refuseRevokingProtected(targetId: string): Promise<void> {
    const target = await this.adminRepo.findOne({
      where: { id: targetId },
      select: ['id', 'isProtected'],
    });

    if (target?.isProtected) {
      throw new ForbiddenException(
        'This account holds the organisation-level administrator role. Its ' +
          'access cannot be revoked from a dashboard.',
      );
    }
  }

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
  private async requireVisible(
    id: string,
    actorSite: number,
    actorId?: string,
  ): Promise<void> {
    const held = await this.adminRoleRepo.count({
      where: { adminId: id, siteCode: actorSite, revokedAt: IsNull() },
    });
    if (held === 0) {
      throw new NotFoundException(`Staff member ${id} not found`);
    }

    /*
     * A protected account is invisible to a unit administrator, not merely
     * unmanageable by one.
     *
     * It holds a badge on every brand, so it satisfies the check above on all
     * three dashboards. `refuseProtected` already stopped a unit admin
     * changing it — but they could still read it, open its role history and
     * see which other brands it reaches. That is the organisation's account,
     * not the unit's, and the list it belongs on is the root's own.
     *
     * 404, deliberately the same answer as an id that does not exist. A 403
     * would confirm the account is there and merely out of reach, which is the
     * fact being withheld.
     */
    if (actorId && (await this.isProtectedTo(id, actorId))) {
      throw new NotFoundException(`Staff member ${id} not found`);
    }
  }

  /** Target is protected and the caller is not — so it is not theirs to see. */
  private async isProtectedTo(targetId: string, actorId: string): Promise<boolean> {
    if (targetId === actorId) return false;
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
    return Boolean(target?.isProtected) && !actor?.isProtected;
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
    profileMap?: Map<string, Employee>,
  ): StaffMember {
    const profile = profileMap?.get(admin.id);

    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      isActive: admin.isActive,
      status: this.statusOf(admin),
      invitedAt: admin.invitedAt,
      mustChangePassword: admin.mustChangePassword,
      lastLoginAt: admin.lastLoginAt,
      createdDate: admin.createdDate,
      roles: roleMap.get(admin.id) ?? [],
      profile: profile
        ? {
            employeeCode: profile.employeeCode,
            designation: profile.designation,
            mobile: profile.mobile,
            department: profile.department
              ? {
                  code: profile.department.departmentCode,
                  name: profile.department.departmentName,
                }
              : null,
            employmentType: profile.employmentType,
            officeCode: profile.officeCode,
            joiningDate: profile.joiningDate,
            reportingTo: profile.reportingTo,
          }
        : null,
    };
  }

  /**
   * Read in this order — each condition assumes the ones above it are false.
   *
   * DISABLED first because it overrides everything: a deactivated account that
   * has signed in before is not ACTIVE, whatever its timestamps say.
   */
  private statusOf(admin: Admin): StaffStatus {
    if (!admin.isActive) return 'DISABLED';
    if (!admin.invitedAt) return 'PENDING';
    if (!admin.lastLoginAt) return 'INVITED';
    return 'ACTIVE';
  }

  /**
   * One query for a page of people, keyed by the account that points at them.
   *
   * Reached through `admins.employee_id` rather than the other way round,
   * because the account is what this service lists — an employee with no login
   * is real and simply does not appear here.
   */
  /**
   * Colleagues this session may hand a record to.
   *
   * A separate route from the staff list, and deliberately not behind the
   * ADMINS feature. Assigning a quote, a site visit or a candidate is
   * `UPDATE` on that desk's own feature — a Sales Lead assigns site visits
   * and holds no ADMINS at all, so pointing the picker at the staff list
   * would have answered 403 to exactly the people who need it.
   *
   * What it returns is far narrower than that list: a name and a work address
   * for people who already share a dashboard with the caller. No roles, no
   * employee codes, no mobiles, no sign-in history.
   *
   * Same two exclusions as the list. Only badge-holders on the caller's own
   * site, and never the organisation's own account — it holds a badge on
   * every brand, so without that it would appear in every unit's picker.
   */
  async assignable(
    actorSite: number,
    actorId?: string,
  ): Promise<AssignableStaff[]> {
    const qb = this.adminRepo
      .createQueryBuilder('admin')
      .select(['admin.id', 'admin.fullName', 'admin.email'])
      .where('admin.isDeleted = false')
      /* Deactivated accounts cannot sign in, so they cannot pick the work up. */
      .andWhere('admin.isActive = true')
      .andWhere(
        `EXISTS (
           SELECT 1 FROM admin_roles ar
           WHERE ar.admin_id = admin.id
             AND ar.site_code = :actorSite
             AND ar.revoked_at IS NULL
             /*
              * PENDING is a placeholder awaiting a real role and grants
              * nothing, so somebody holding only that cannot act on what
              * they were handed.
              */
             AND ar.role_code <> :pending
         )`,
        { actorSite, pending: ROLE.PENDING },
      );

    if (actorId) {
      qb.andWhere(
        `(admin.is_protected = false OR EXISTS (
             SELECT 1 FROM admins me
              WHERE me.id = :actorId AND me.is_protected = true
           ))`,
        { actorId },
      );
    }

    const admins = await qb.orderBy('admin.fullName', 'ASC').getMany();
    return admins.map((a) => ({
      id: a.id,
      fullName: a.fullName,
      email: a.email,
    }));
  }

  private async profilesFor(ids: string[]): Promise<Map<string, Employee>> {
    if (!ids.length) return new Map();
    const admins = await this.adminRepo.find({
      where: { id: In(ids) },
      select: { id: true, employeeId: true },
    });
    const byEmployee = new Map(
      admins.filter((a) => a.employeeId).map((a) => [a.employeeId!, a.id]),
    );
    if (!byEmployee.size) return new Map();

    const employees = await this.employeeRepo.find({
      where: { id: In([...byEmployee.keys()]) },
      relations: { department: true },
    });
    return new Map(
      employees.map((e) => [byEmployee.get(e.id)!, e] as [string, Employee]),
    );
  }
}
