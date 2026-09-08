import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { Permissions } from './decorators/permissions.decorator';
import { AdminRole } from './entities/admin-role.entity';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { FEATURE, PERMISSION } from './permissions.constants';
import type { AuthenticatedAdmin } from './permissions.constants';
import { ListStaffDto } from './dto/list-staff.dto';
import {
  AssignRoleDto,
  CreateStaffDto,
  ReplaceRolesDto,
  SetPasswordDto,
  SetRolePermissionsDto,
  UpdateStaffDto,
} from './dto/upsert-staff.dto';
import { StaffService } from './staff.service';
import type {
  AssignableStaff,
  StaffMember,
  StaffWithPassword,
} from './staff.service';

/**
 * Staff administration — accounts and the roles they hold.
 *
 * Every route requires the ADMINS feature, which only SUPER_ADMIN carries:
 * handing out roles is effectively handing out every permission those roles
 * contain, so it is not something to delegate casually.
 *
 * What is deliberately absent is any way to edit what a role *means*. The
 * role -> permission matrix is read-only here and changes only by migration,
 * so widening a role stays a reviewed act rather than a click.
 */
@ApiTags('Staff (admin)')
@ApiBearerAuth('jwt')
@UseGuards(AdminJwtGuard, PermissionsGuard)
@Controller('admin/staff')
export class AdminStaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Permissions(FEATURE.ADMINS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'List staff accounts with their live roles' })
  @ResponseMessage('Staff retrieved')
  list(
    @Query() query: ListStaffDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<PaginatedResult<StaffMember>> {
    return this.staffService.list(query, admin.siteCode, admin.id);
  }

  /**
   * Sits above `:id` on purpose — otherwise "roles" is parsed as a UUID and
   * this route is unreachable.
   */
  @Get('roles')
  @Permissions(FEATURE.ADMINS, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'Roles and what each one grants (read-only — edited by migration)',
  })
  @ResponseMessage('Roles retrieved')
  listRoles(@CurrentUser() admin: AuthenticatedAdmin) {
    return this.staffService.listRoles(admin.siteCode);
  }

  /**
   * Change what a role may do — on this dashboard only.
   *
   * A role's meaning is per-brand now: the seeded definition is the default,
   * and this records the differences. Kept under `roles/` rather than on a
   * staff member, because it changes what a role *is* rather than who holds it.
   */
  @Put('roles/:roleCode/permissions')
  @HttpCode(HttpStatus.OK)
  @Permissions(FEATURE.ADMINS, PERMISSION.UPDATE)
  @ApiOperation({
    summary: "Set a role's permissions on your dashboard",
  })
  @ResponseMessage('Role permissions updated')
  async setRolePermissions(
    @Param('roleCode', ParseIntPipe) roleCode: number,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ) {
    await this.staffService.setRolePermissions(
      roleCode,
      dto.grants,
      admin.id,
      admin.siteCode,
      admin.roleCode,
    );
    return this.staffService.listRoles(admin.siteCode);
  }

  /** Put a role back to its seeded definition on this dashboard. */
  @Delete('roles/:roleCode/permissions')
  @Permissions(FEATURE.ADMINS, PERMISSION.UPDATE)
  @ApiOperation({ summary: "Reset a role's permissions to the defaults" })
  @ResponseMessage('Role permissions reset')
  async resetRolePermissions(
    @Param('roleCode', ParseIntPipe) roleCode: number,
    @CurrentUser() admin: AuthenticatedAdmin,
  ) {
    await this.staffService.resetRolePermissions(
      roleCode,
      admin.id,
      admin.siteCode,
      admin.roleCode,
    );
    return this.staffService.listRoles(admin.siteCode);
  }

  /**
   * The assignee picker's list. Any signed-in admin, by design — see the
   * service. Declared above `:id` so the literal path wins the match.
   */
  @Get('assignable')
  @ApiOperation({
    summary: 'Colleagues on this dashboard a record may be assigned to',
  })
  @ResponseMessage('Assignable staff retrieved')
  assignable(
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<AssignableStaff[]> {
    return this.staffService.assignable(admin.siteCode, admin.id);
  }

  @Get(':id')
  @Permissions(FEATURE.ADMINS, PERMISSION.VIEW)
  @ApiOperation({ summary: 'One staff account' })
  @ResponseMessage('Staff member retrieved')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<StaffMember> {
    return this.staffService.view(id, admin.siteCode, admin.id);
  }

  @Get(':id/role-history')
  @Permissions(FEATURE.ADMINS, PERMISSION.VIEW)
  @ApiOperation({
    summary: 'Every role ever assigned, including revoked — the audit trail',
  })
  @ResponseMessage('Role history retrieved')
  roleHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<AdminRole[]> {
    return this.staffService.listRoleHistory(id, admin.siteCode, admin.id);
  }

  /**
   * Grant an employee a way in — the whole act, in one call.
   *
   * A password and a real role are both required. It used to be two steps,
   * with an invitation issuing the credential afterwards; that left accounts
   * that looked finished in the staff list and could not be used, so the two
   * halves were merged and the invitation removed. Re-issuing a password later
   * is `:id/reset-password`.
   */
  @Post()
  @Permissions(FEATURE.ADMINS, PERMISSION.CREATE)
  @ApiOperation({
    summary: 'Grant access — creates the account with its password and role',
  })
  @ResponseMessage('Staff account created')
  create(
    @Body() dto: CreateStaffDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<StaffMember> {
    return this.staffService.create(dto, admin.id, admin.siteCode);
  }

  @Patch(':id')
  @Permissions(FEATURE.ADMINS, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Rename, or activate/deactivate — deactivating ends all sessions',
  })
  @ResponseMessage('Staff account updated')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<StaffMember> {
    return this.staffService.update(id, dto, admin.id, admin.siteCode);
  }

  @Post(':id/roles')
  @Permissions(FEATURE.ADMINS, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Grant one badge — on the dashboard you are signed in to',
  })
  @ResponseMessage('Role granted')
  grantRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<StaffMember> {
    return this.staffService.grantRole(
      id,
      dto.roleCode,
      admin.id,
      admin.siteCode,
    );
  }

  /**
   * The site is in the path because a badge is identified by both codes — the
   * same role on two brands is two separate grants.
   */
  @Delete(':id/roles/:siteCode/:roleCode')
  @Permissions(FEATURE.ADMINS, PERMISSION.UPDATE)
  @ApiOperation({ summary: 'Revoke one badge' })
  @ResponseMessage('Role revoked')
  revokeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('siteCode', ParseIntPipe) siteCode: number,
    @Param('roleCode', ParseIntPipe) roleCode: number,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<StaffMember> {
    return this.staffService.revokeRole(
      id,
      roleCode,
      siteCode,
      admin.id,
      admin.siteCode,
    );
  }

  /** For a checkbox form that saves one dashboard's selection at once. */
  @Put(':id/roles')
  @Permissions(FEATURE.ADMINS, PERMISSION.UPDATE)
  @ApiOperation({
    summary:
      "Replace your dashboard's role set, leaving other dashboards untouched",
  })
  @ResponseMessage('Roles updated')
  replaceRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceRolesDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<StaffMember> {
    return this.staffService.replaceRoles(
      id,
      dto.roleCodes,
      admin.id,
      admin.siteCode,
    );
  }

  /**
   * Set a password an administrator chose, rather than minting one.
   *
   * Separate from `reset-password` on purpose: that one issues a temporary
   * credential and forces a change at next sign-in. This one is used when
   * somebody is handed their password directly, so it is theirs to keep.
   */
  @Post(':id/set-password')
  @HttpCode(HttpStatus.OK)
  @Permissions(FEATURE.ADMINS, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Set a chosen password and end every session',
  })
  @ResponseMessage('Password set')
  setPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPasswordDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<StaffMember> {
    return this.staffService.setPassword(
      id,
      dto.password,
      dto.sendEmail ?? false,
      admin.id,
      admin.siteCode,
    );
  }

  @Post(':id/reset-password')
  @Permissions(FEATURE.ADMINS, PERMISSION.UPDATE)
  @ApiOperation({
    summary: 'Issue a new temporary password and end every session',
  })
  @ResponseMessage('Password reset')
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<StaffWithPassword> {
    return this.staffService.resetPassword(id, admin.id, admin.siteCode);
  }
}
