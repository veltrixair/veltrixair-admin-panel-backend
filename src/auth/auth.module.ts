import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminStaffController } from './admin-staff.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Admin } from './entities/admin.entity';
import { AdminRole } from './entities/admin-role.entity';
import { FeatureMaster } from './entities/feature-master.entity';
import { PermissionMaster } from './entities/permission-master.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RoleMaster } from './entities/role-master.entity';
import { RolePermission } from './entities/role-permission.entity';
import { SiteMaster } from '../master-data/entities/site-master.entity';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { PermissionService } from './permission.service';
import { StaffService } from './staff.service';
import { JwtAdminStrategy } from './strategies/jwt-admin.strategy';

/**
 * Identity: proving who someone is, what they may do, and administering the
 * accounts themselves.
 *
 * Staff administration lives here rather than in its own module because it owns
 * no tables of its own — every entity it touches is defined in this module. A
 * module that owns nothing and borrows everything is a folder, not a boundary.
 *
 * Global because every feature module's admin controller uses these guards.
 * Marking it global is what stops each of them having to import AuthModule and
 * risking a circular graph. Note that @Global only broadcasts what appears in
 * `exports` — StaffService is deliberately absent from that list, so it stays
 * private to this module and cannot be injected from a feature service.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Admin,
      AdminRole,
      RoleMaster,
      FeatureMaster,
      PermissionMaster,
      RolePermission,
      RefreshToken,
      SiteMaster,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt-admin' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('ADMIN_JWT_SECRET'),
        signOptions: {
          // `expiresIn` is typed as a literal union of duration strings, which
          // a value read from the environment can never satisfy statically.
          expiresIn: (config.get<string>('ADMIN_ACCESS_TOKEN_TTL') ??
            '15m') as SignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController, AdminStaffController],
  providers: [
    AuthService,
    PermissionService,
    StaffService,
    JwtAdminStrategy,
    AdminJwtGuard,
    PermissionsGuard,
  ],
  // StaffService is intentionally not exported — see the note above.
  exports: [AuthService, PermissionService, AdminJwtGuard, PermissionsGuard],
})
export class AuthModule {}
