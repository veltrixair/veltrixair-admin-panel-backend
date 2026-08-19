import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Staff identity: accounts, the role matrix, and refresh sessions.
 *
 * Every admin route built so far has been unprotected, with a `currentActor()`
 * stub returning null into audit columns that were always shaped for a real
 * user. This migration is what fills that in.
 *
 * Two departures from the HRMS reference:
 *
 *  1. `refresh_tokens` stores a hash, a family id and a `replaced_by` pointer,
 *     so tokens rotate on every refresh and a replayed one is detectable.
 *     The reference issues a long-lived refresh token and never retires it.
 *
 *  2. Passwords are argon2id, not bcrypt. Bcrypt is cheap to attack on a GPU
 *     because it barely uses memory; argon2id is deliberately memory-hard.
 *
 * Codes start at 101 to match the rest of this schema and the reference project.
 * Features occupy 101–199; 201–299 is left free so a client portal can be added
 * without a renumbering migration.
 */
export class CreateAuthModule1785834000000 implements MigrationInterface {
  name = 'CreateAuthModule1785834000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------- masters

    await queryRunner.query(`
      CREATE TABLE "role_masters" (
        "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
        "role_code"    integer NOT NULL,
        "role_name"    character varying(50) NOT NULL,
        "description"  character varying(300),
        "is_active"    boolean NOT NULL DEFAULT true,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        "updated_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_role_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_role_masters_role_code_unique" UNIQUE ("role_code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "feature_masters" (
        "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
        "feature_code" integer NOT NULL,
        "feature_name" character varying(50) NOT NULL,
        "description"  character varying(300),
        "is_active"    boolean NOT NULL DEFAULT true,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        "updated_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_feature_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_feature_masters_feature_code_unique" UNIQUE ("feature_code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "permission_masters" (
        "id"              uuid NOT NULL DEFAULT gen_random_uuid(),
        "permission_code" integer NOT NULL,
        "permission_name" character varying(50) NOT NULL,
        "is_active"       boolean NOT NULL DEFAULT true,
        "created_date"    timestamptz NOT NULL DEFAULT now(),
        "updated_date"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_permission_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_permission_masters_permission_code_unique" UNIQUE ("permission_code")
      )
    `);

    // ---------------------------------------------------------------- admins

    await queryRunner.query(`
      CREATE TABLE "admins" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "email"         character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "full_name"     character varying(150) NOT NULL,
        "is_active"     boolean NOT NULL DEFAULT true,
        "last_login_at" timestamptz,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_admins_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_admins_email_unique" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_roles" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "admin_id"      uuid NOT NULL,
        "role_code"     integer NOT NULL,
        "assigned_by"   uuid,
        "assigned_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_admin_roles_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_admin_roles_admin_id_role_code_unique" UNIQUE ("admin_id", "role_code")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "admin_roles"
        ADD CONSTRAINT "vtx_admin_roles_admin_id_fk"
        FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE
    `);

    // RESTRICT, not CASCADE: deleting a role that people still hold should fail
    // loudly rather than silently strip their access.
    await queryRunner.query(`
      ALTER TABLE "admin_roles"
        ADD CONSTRAINT "vtx_admin_roles_role_code_fk"
        FOREIGN KEY ("role_code") REFERENCES "role_masters"("role_code") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "id"              uuid NOT NULL DEFAULT gen_random_uuid(),
        "role_code"       integer NOT NULL,
        "feature_code"    integer NOT NULL,
        "permission_code" integer NOT NULL,
        "created_date"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_role_permissions_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_role_permissions_unique"
          UNIQUE ("role_code", "feature_code", "permission_code")
      )
    `);

    // -------------------------------------------------------- refresh tokens

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
        "subject_id"   uuid NOT NULL,
        "subject_type" character varying(10) NOT NULL,
        "token_hash"   character varying(64) NOT NULL,
        "family_id"    uuid NOT NULL,
        "replaced_by"  uuid,
        "expires_at"   timestamptz NOT NULL,
        "revoked_at"   timestamptz,
        "ip_hash"      character varying(64),
        "created_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_refresh_tokens_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_refresh_tokens_token_hash_unique" UNIQUE ("token_hash"),
        CONSTRAINT "vtx_refresh_tokens_subject_type_check"
          CHECK ("subject_type" IN ('admin','client'))
      )
    `);

    // No FK to "admins": subject_id is polymorphic by design, so a client
    // portal can reuse this table rather than needing a parallel one.
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_subject_id" ON "refresh_tokens" ("subject_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_family_id" ON "refresh_tokens" ("family_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_admins_email" ON "admins" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_admin_roles_admin_id" ON "admin_roles" ("admin_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_role_permissions_role_code" ON "role_permissions" ("role_code")`,
    );

    // ----------------------------------------------------------------- seeds

    await queryRunner.query(`
      INSERT INTO "feature_masters" ("feature_code", "feature_name", "description") VALUES
        (101, 'CONTACT',   'Enquiries from the contact form, their routing and SLA'),
        (102, 'CAREERS',   'Job postings, locations and work modes'),
        (103, 'INSIGHTS',  'Articles, topics, types and regions'),
        (104, 'DISCOVERY', 'Architects, availability slots and discovery bookings'),
        (105, 'FILES',     'Uploaded assets and gated-download leads')
    `);

    await queryRunner.query(`
      INSERT INTO "permission_masters" ("permission_code", "permission_name") VALUES
        (101, 'VIEW'),
        (102, 'CREATE'),
        (103, 'UPDATE'),
        (104, 'DELETE')
    `);

    await queryRunner.query(`
      INSERT INTO "role_masters" ("role_code", "role_name", "description") VALUES
        (101, 'SUPER_ADMIN',    'Full access to every feature'),
        (102, 'CONTENT_EDITOR', 'Writes and publishes insights; edits job copy'),
        (103, 'RECRUITER',      'Owns job postings and reads contact enquiries'),
        (104, 'SALES',          'Owns enquiries and discovery bookings'),
        (105, 'VIEWER',         'Read-only across the admin surface')
    `);

    // The matrix, written as data rather than as five hand-listed INSERTs.
    // SUPER_ADMIN gets every cell by cross join, so a feature added later only
    // has to be granted to the other roles.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      SELECT 101, f."feature_code", p."permission_code"
      FROM "feature_masters" f CROSS JOIN "permission_masters" p
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code") VALUES
        -- CONTENT_EDITOR: owns insights; may reword a job posting but not create
        -- or remove one, and uploads whitepaper PDFs.
        (102, 103, 101), (102, 103, 102), (102, 103, 103), (102, 103, 104),
        (102, 102, 101), (102, 102, 103),
        (102, 105, 101), (102, 105, 102),

        -- RECRUITER: owns careers end to end; reads enquiries because candidate
        -- questions arrive through the contact form.
        (103, 102, 101), (103, 102, 102), (103, 102, 103), (103, 102, 104),
        (103, 101, 101),
        (103, 105, 101),

        -- SALES: owns the lead pipeline — enquiries and discovery bookings.
        (104, 101, 101), (104, 101, 102), (104, 101, 103), (104, 101, 104),
        (104, 104, 101), (104, 104, 102), (104, 104, 103), (104, 104, 104),
        (104, 105, 101),

        -- VIEWER: read-only, and not on files at all — a gated-download list is
        -- a list of named leads, which is not something to hand out by default.
        (105, 101, 101), (105, 102, 101), (105, 103, 101), (105, 104, 101)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admins"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permission_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_masters"`);
  }
}
