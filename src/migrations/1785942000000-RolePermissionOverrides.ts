import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Let a unit change what a role can do on its own dashboard.
 *
 * `role_permissions` has no site dimension: RECRUITER means the same thing on
 * IT, cranes and privacy. That is a reasonable default and a poor rule — the
 * three businesses do not run the same way, and a Recruiter who should only
 * read personnel files on cranes had no way to be told so without changing
 * what Recruiter means everywhere.
 *
 * Stored as differences rather than a per-site copy of the whole table. Three
 * things follow from that, and each is why it is worth the join:
 *
 *   - the seeded definitions are never mutated, so "what was this role meant
 *     to be" remains answerable;
 *   - resetting a unit to defaults is deleting its overrides, not restoring a
 *     backup of them;
 *   - a change to a default reaches every unit that has not overridden it,
 *     which is what a default is for.
 *
 * `granted` carries the direction: false removes a permission the role has by
 * default, true adds one it does not. Both are allowed — a unit can widen a
 * role as well as narrow it.
 *
 * The view is the point of the exercise. Four places read permissions — the
 * route guard, /me, the notification feed and the roles list — and if any one
 * of them kept reading the raw table they would disagree. Disagreement here is
 * not a display bug: it is a nav that offers what the guard refuses, or worse,
 * a guard that allows what the nav has hidden.
 */
export class RolePermissionOverrides1785942000000 implements MigrationInterface {
  name = 'RolePermissionOverrides1785942000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "role_permission_overrides" (
        "site_code" int NOT NULL,
        "role_code" int NOT NULL,
        "feature_code" int NOT NULL,
        "permission_code" int NOT NULL,

        -- false: remove a default. true: add one the role does not have.
        "granted" boolean NOT NULL,

        "created_date" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid NULL,

        CONSTRAINT "vtx_role_permission_overrides_pk"
          PRIMARY KEY ("site_code", "role_code", "feature_code", "permission_code")
      )
    `);

    /*
     * Who changed a role's definition, and to what.
     *
     * Role *assignments* have had an audit trail from the start — every badge
     * ever granted or revoked lives in admin_roles. Role *definitions* had
     * none, because until now they could not be changed outside a migration.
     * Quietly restricting what a whole role may do is at least as consequential
     * as moving one person between roles, so it leaves the same kind of record.
     */
    await queryRunner.query(`
      CREATE TABLE "role_permission_audit" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4()
          CONSTRAINT "vtx_role_permission_audit_id_pk" PRIMARY KEY,

        "site_code" int NOT NULL,
        "role_code" int NOT NULL,
        "feature_code" int NOT NULL,
        "permission_code" int NOT NULL,

        -- What it became. Null means "back to the seeded default", which is
        -- what removing an override does.
        "granted" boolean NULL,

        "actor_admin_id" uuid NULL,
        "created_date" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "vtx_role_permission_audit_actor_fk"
          FOREIGN KEY ("actor_admin_id") REFERENCES "admins"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_role_permission_audit_role" ON "role_permission_audit" ` +
        `("site_code", "role_code", "created_date" DESC)`,
    );

    /*
     * The one place that answers "may this role do this here".
     *
     * UNION rather than UNION ALL: a permission that is both a default and an
     * explicit grant would otherwise appear twice, and every caller of this
     * view asks an existence question where a duplicate is noise.
     */
    await queryRunner.query(`
      CREATE VIEW "effective_role_permissions" AS
        SELECT s."site_code", rp."role_code", rp."feature_code", rp."permission_code"
          FROM "role_permissions" rp
          CROSS JOIN "site_masters" s
         WHERE NOT EXISTS (
                 SELECT 1 FROM "role_permission_overrides" o
                  WHERE o."site_code" = s."site_code"
                    AND o."role_code" = rp."role_code"
                    AND o."feature_code" = rp."feature_code"
                    AND o."permission_code" = rp."permission_code"
                    AND o."granted" = false
               )
        UNION
        SELECT o."site_code", o."role_code", o."feature_code", o."permission_code"
          FROM "role_permission_overrides" o
         WHERE o."granted" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS "effective_role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permission_audit"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permission_overrides"`);
  }
}
