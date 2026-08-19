import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Staff administration: managing the people who hold admin accounts.
 *
 * Until now the only way to create an account or change its roles was
 * scripts/create-admin.js, which needs database credentials. That is fine for
 * two people and wrong for ten — onboarding a colleague should not require a
 * terminal.
 *
 * Two deliberate limits:
 *
 *  1. Only the admin -> role assignment becomes editable at runtime. The
 *     role -> permission matrix stays in migrations. Assigning a role is an
 *     operational act that happens often; changing what a role *means* is a
 *     policy change that should go through code review and leave a trace in
 *     git. It also bounds the damage a compromised super-admin session can do:
 *     it can hand out existing roles, but it cannot quietly widen them.
 *
 *  2. Revoking a role soft-deletes the assignment rather than removing the row,
 *     so "who gave this person access, and who took it away" stays answerable.
 *     That forces the uniqueness rule to become partial — without it, granting
 *     a role that was revoked earlier would collide with the dead row.
 */
export class CreateStaffModule1785837600000 implements MigrationInterface {
  name = 'CreateStaffModule1785837600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------- the ADMINS feature

    await queryRunner.query(`
      INSERT INTO "feature_masters" ("feature_code", "feature_name", "description")
      VALUES (106, 'ADMINS', 'Staff accounts and the roles they hold')
    `);

    // SUPER_ADMIN only. Deliberately not granted to any other seeded role:
    // the ability to hand out roles is the ability to hand out every
    // permission that any role carries.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      SELECT 101, 106, p."permission_code" FROM "permission_masters" p
    `);

    // ------------------------------------------- soft revocation of roles

    await queryRunner.query(
      `ALTER TABLE "admin_roles" ADD COLUMN "revoked_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_roles" ADD COLUMN "revoked_by" uuid`,
    );

    // The old constraint spanned every row including revoked ones. Replaced
    // with a partial unique index so only LIVE assignments have to be unique.
    await queryRunner.query(`
      ALTER TABLE "admin_roles"
        DROP CONSTRAINT IF EXISTS "vtx_admin_roles_admin_id_role_code_unique"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "vtx_admin_roles_admin_id_role_code_unique"
        ON "admin_roles" ("admin_id", "role_code")
        WHERE "revoked_at" IS NULL
    `);

    // Every permission check filters on this, so it belongs in the index.
    await queryRunner.query(`
      CREATE INDEX "idx_admin_roles_admin_id_live"
        ON "admin_roles" ("admin_id")
        WHERE "revoked_at" IS NULL
    `);

    // Who created the account, for the same reason assigned_by exists.
    await queryRunner.query(
      `ALTER TABLE "admins" ADD COLUMN "created_by" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admins" DROP COLUMN IF EXISTS "created_by"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_admin_roles_admin_id_live"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "vtx_admin_roles_admin_id_role_code_unique"`,
    );

    // Revoked duplicates would break the full-table constraint being restored.
    await queryRunner.query(
      `DELETE FROM "admin_roles" WHERE "revoked_at" IS NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "admin_roles"
        ADD CONSTRAINT "vtx_admin_roles_admin_id_role_code_unique"
        UNIQUE ("admin_id", "role_code")
    `);
    await queryRunner.query(
      `ALTER TABLE "admin_roles" DROP COLUMN IF EXISTS "revoked_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_roles" DROP COLUMN IF EXISTS "revoked_at"`,
    );

    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "feature_code" = 106`,
    );
    await queryRunner.query(
      `DELETE FROM "feature_masters" WHERE "feature_code" = 106`,
    );
  }
}
