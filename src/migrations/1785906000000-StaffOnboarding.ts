import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Staff onboarding: a profile, a holding role, and a two-step activation.
 *
 * Until now an account was created and immediately usable — one call minted a
 * password and granted whatever roles the caller named. That collapses three
 * separate decisions (who is this person, may they sign in, what may they do)
 * into a single form.
 *
 * This splits them:
 *
 *   1. `department_masters` and `admin_profiles` record who someone is.
 *      `admins` keeps only what authenticates them.
 *   2. A PENDING role (106) with no permissions at all becomes the default
 *      badge, so a new account can sign in and see nothing until somebody
 *      decides what it should reach. VIEWER was the obvious alternative and is
 *      the wrong one: it grants read on contact enquiries, crane quotes and
 *      privacy enquiries — every customer's name, email and phone number —
 *      before anyone has said what the person's job is.
 *   3. `admins` gains `invited_at` and `must_change_password`, and
 *      `password_hash` becomes nullable so an account can exist before it can
 *      be used.
 */
export class StaffOnboarding1785906000000 implements MigrationInterface {
  name = 'StaffOnboarding1785906000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- departments ------------------------------------------------------
    //
    // No site_code, unlike almost every other master. Finance is Finance on
    // all three brands, and a person may hold badges on several at once.
    await queryRunner.query(`
      CREATE TABLE "department_masters" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "department_code" int  NOT NULL,
        "department_name" varchar(100) NOT NULL,
        "display_order"   int  NOT NULL DEFAULT 0,
        "is_active"       boolean NOT NULL DEFAULT true,
        "is_deleted"      boolean NOT NULL DEFAULT false,
        "deleted_at"      timestamptz,
        "created_date"    timestamptz NOT NULL DEFAULT now(),
        "updated_date"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_department_masters_id_pk"      PRIMARY KEY ("id"),
        CONSTRAINT "vtx_department_masters_code_unique" UNIQUE ("department_code")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "department_masters"
        ("department_code","department_name","display_order") VALUES
        (101,'Engineering',1),
        (102,'Delivery',2),
        (103,'Sales',3),
        (104,'Marketing',4),
        (105,'Field Operations',5),
        (106,'Human Resources',6),
        (107,'Finance',7),
        (108,'Legal & Privacy',8),
        (109,'IT Support',9)
    `);

    // --- the holding role -------------------------------------------------
    //
    // Deliberately seeded with NO rows in role_permissions. A role that grants
    // nothing needs no guard changes: every @Permissions check already fails
    // when the grant is absent.
    await queryRunner.query(`
      INSERT INTO "role_masters" ("role_code","role_name","description")
      VALUES (106,'PENDING','Created, awaiting a role. Can sign in; can reach nothing.')
      ON CONFLICT ("role_code") DO NOTHING
    `);

    // --- account lifecycle ------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "admins"
        ALTER COLUMN "password_hash" DROP NOT NULL,
        ADD COLUMN "invited_at"           timestamptz,
        ADD COLUMN "must_change_password" boolean NOT NULL DEFAULT false
    `);

    /*
     * Everyone who exists today was created under the old one-step flow, so
     * they were invited at the moment they were created. Backfilling from
     * created_date keeps "invited_at IS NULL" meaning exactly one thing —
     * never invited — rather than also meaning "predates this migration".
     */
    await queryRunner.query(`
      UPDATE "admins" SET "invited_at" = "created_date"
       WHERE "password_hash" IS NOT NULL
    `);

    // --- profiles ---------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "admin_profiles" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "admin_id"        uuid NOT NULL,
        "employee_code"   varchar(30)  NOT NULL,
        "designation"     varchar(150) NOT NULL,
        "department_code" int          NOT NULL,
        "employment_type" varchar(20)  NOT NULL,
        "mobile"          varchar(32),
        "office_code"     int,
        "joining_date"    date,
        "probation_until" date,
        "reporting_to"    uuid,
        "notes"           text,
        "created_date"    timestamptz NOT NULL DEFAULT now(),
        "updated_date"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_admin_profiles_id_pk"            PRIMARY KEY ("id"),
        CONSTRAINT "vtx_admin_profiles_admin_id_unique"  UNIQUE ("admin_id"),
        CONSTRAINT "vtx_admin_profiles_employee_code_unique" UNIQUE ("employee_code"),
        CONSTRAINT "vtx_admin_profiles_employment_type_check"
          CHECK ("employment_type" IN ('FULL_TIME','CONTRACT','INTERN','CONSULTANT')),
        CONSTRAINT "vtx_admin_profiles_admin_id_fk"
          FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_admin_profiles_department_code_fk"
          FOREIGN KEY ("department_code") REFERENCES "department_masters"("department_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_admin_profiles_office_code_fk"
          FOREIGN KEY ("office_code") REFERENCES "office_masters"("office_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_admin_profiles_reporting_to_fk"
          FOREIGN KEY ("reporting_to") REFERENCES "admins"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_admin_profiles_department" ON "admin_profiles" ("department_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_admin_profiles_reporting_to" ON "admin_profiles" ("reporting_to")`,
    );

    /*
     * Employee codes for the people already here.
     *
     * Ordered by created_date so the numbering follows who joined first, and
     * the sequence starts where this backfill ends so the next issued code
     * cannot collide with one of these.
     */
    await queryRunner.query(`
      INSERT INTO "admin_profiles"
        ("admin_id","employee_code","designation","department_code","employment_type")
      SELECT a."id",
             'VTX-EMP-' || lpad((row_number() OVER (ORDER BY a."created_date"))::text, 4, '0'),
             'To be confirmed',
             109,
             'FULL_TIME'
        FROM "admins" a
       WHERE a."is_deleted" = false
    `);

    await queryRunner.query(`
      CREATE SEQUENCE "admin_employee_code_seq" START WITH 1
    `);
    await queryRunner.query(`
      SELECT setval('admin_employee_code_seq',
                    GREATEST((SELECT count(*) FROM "admin_profiles"), 1))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP SEQUENCE IF EXISTS "admin_employee_code_seq"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "department_masters"`);

    // Anyone left holding only the holding role would be unable to sign in
    // once it is gone, so give them VIEWER before removing it.
    await queryRunner.query(
      `UPDATE "admin_roles" SET "role_code" = 105 WHERE "role_code" = 106`,
    );
    await queryRunner.query(
      `DELETE FROM "role_masters" WHERE "role_code" = 106`,
    );

    await queryRunner.query(`
      ALTER TABLE "admins"
        DROP COLUMN "must_change_password",
        DROP COLUMN "invited_at"
    `);
    await queryRunner.query(`
      UPDATE "admins" SET "password_hash" = '!' WHERE "password_hash" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "admins" ALTER COLUMN "password_hash" SET NOT NULL`,
    );
  }
}
