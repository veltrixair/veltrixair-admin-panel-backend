import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-site scope: one backend and one admin login serving three businesses.
 *
 *   101  Veltrixair IT          veltrixair.com
 *   102  Veltrixair Industries  veltrixairindustries.com   (cranes)
 *   103  Veltrixair Privacy     dp.veltrixair.com          (advisory)
 *
 * The whole model is one column. A role assignment stops being a pair —
 * (admin, role) — and becomes a triple: (admin, role, site). One person, one
 * password, different access per brand.
 *
 * This migration is deliberately additive and backfills everything to 101.
 * Nothing reads `site_code` until the code lands, so it is safe to run on its
 * own and the application behaves exactly as before.
 *
 * Two things NOT scoped, and the reasoning matters:
 *
 *  - `role_permissions`. What SALES means is the same on every brand; only
 *    *where* you hold it varies. Scoping it would turn five roles into fifteen.
 *  - The event tables. They are always reached through their parent, which is
 *    site-checked, and a duplicated site column could drift from it. The rule
 *    that replaces the column: never load events by id alone — load the parent
 *    with its site first.
 */
export class CreateSiteScope1785848400000 implements MigrationInterface {
  name = 'CreateSiteScope1785848400000';

  /** Feature data. Every row here belongs to exactly one brand. */
  private readonly scopedTables = [
    'contact_enquiries',
    'job_postings',
    'articles',
    'job_applications',
    'discovery_bookings',
    'architects',
    'session_slots',
    'architect_availability_rules',
    'architect_blackouts',
    'stored_files',
    'asset_download_requests',
  ];

  /**
   * Lookup lists whose contents genuinely differ per brand — "Lifting &
   * Rigging" is not an IT practice, and a crane enquiry is not about ISO 42001.
   *
   * Countries, industries, regions, qualifications, notice periods, work
   * authorisations, application sources and enquiry timelines stay shared: a
   * Master's degree is a Master's degree in every business.
   */
  private readonly scopedMasters = [
    'enquiry_topic_masters',
    'practice_area_masters',
    'article_topic_masters',
    'article_type_masters',
    'job_location_masters',
    'office_masters',
    'discovery_practice_masters',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------- the sites

    await queryRunner.query(`
      CREATE TABLE "site_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_code"     integer NOT NULL,
        "site_name"     character varying(100) NOT NULL,
        "slug"          character varying(60) NOT NULL,
        "admin_domain"  character varying(255) NOT NULL,
        "public_domain" character varying(255),
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_site_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_site_masters_site_code_unique" UNIQUE ("site_code"),
        CONSTRAINT "vtx_site_masters_slug_unique" UNIQUE ("slug"),
        CONSTRAINT "vtx_site_masters_admin_domain_unique" UNIQUE ("admin_domain")
      )
    `);

    // `admin_domain` is what the dashboard is served from after sign-in, and
    // what a token's site claim is checked against. `public_domain` is how an
    // anonymous contact form works out which brand it belongs to.
    await queryRunner.query(`
      INSERT INTO "site_masters"
        ("site_code", "site_name", "slug", "admin_domain", "public_domain", "display_order") VALUES
        (101, 'Veltrixair IT',         'it',      'it.veltrixair.com',    'veltrixair.com',            1),
        (102, 'Veltrixair Industries', 'crane',   'crane.veltrixair.com', 'veltrixairindustries.com',  2),
        (103, 'Veltrixair Privacy',    'privacy', 'dp.veltrixair.com',    NULL,                        3)
    `);

    // ------------------------------------------------- badges become triples

    await queryRunner.query(
      `ALTER TABLE "admin_roles" ADD COLUMN "site_code" integer`,
    );
    await queryRunner.query(`UPDATE "admin_roles" SET "site_code" = 101`);
    await queryRunner.query(
      `ALTER TABLE "admin_roles" ALTER COLUMN "site_code" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "admin_roles"
        ADD CONSTRAINT "vtx_admin_roles_site_code_fk"
        FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT
    `);

    // The same person may hold the same role on two brands, so uniqueness has
    // to widen. Still partial: revoked rows stay for the audit trail.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "vtx_admin_roles_admin_id_role_code_unique"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "vtx_admin_roles_admin_role_site_unique"
        ON "admin_roles" ("admin_id", "role_code", "site_code")
        WHERE "revoked_at" IS NULL
    `);

    // The guard's hot path: every authenticated request checks this badge.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_admin_roles_admin_id_live"`,
    );
    await queryRunner.query(`
      CREATE INDEX "idx_admin_roles_admin_site_live"
        ON "admin_roles" ("admin_id", "site_code")
        WHERE "revoked_at" IS NULL
    `);

    // ------------------------------------------------- sessions carry a scope

    // A session belongs to one brand and one role, chosen at sign-in. Storing
    // it here is what stops a refresh being used to widen access or move brand.
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN "site_code" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN "role_code" integer`,
    );
    await queryRunner.query(
      `UPDATE "refresh_tokens" SET "site_code" = 101 WHERE "subject_type" = 'admin'`,
    );

    // Existing sessions predate role scoping and have no role recorded, so the
    // column stays nullable rather than inventing one for them. They are
    // rejected on refresh and their owners sign in again — a one-off cost paid
    // once, in exchange for never guessing at someone's authority.
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        ADD CONSTRAINT "vtx_refresh_tokens_site_code_fk"
        FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT
    `);

    // ------------------------------------------------------- scope every table

    for (const table of [...this.scopedTables, ...this.scopedMasters]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "site_code" integer`,
      );
      await queryRunner.query(`UPDATE "${table}" SET "site_code" = 101`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "site_code" SET NOT NULL`,
      );
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD CONSTRAINT "vtx_${table}_site_code_fk"
          FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT
      `);
      await queryRunner.query(
        `CREATE INDEX "idx_${table}_site_code" ON "${table}" ("site_code")`,
      );
    }

    // A slug is only unique within a brand — cranes and IT may both run a
    // "senior-project-manager" role without colliding.
    await queryRunner.query(
      `ALTER TABLE "job_postings" DROP CONSTRAINT IF EXISTS "vtx_job_postings_slug_unique"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "vtx_job_postings_site_slug_unique"
        ON "job_postings" ("site_code", "slug") WHERE "is_deleted" = false
    `);
    await queryRunner.query(
      `ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "vtx_articles_slug_unique"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "vtx_articles_site_slug_unique"
        ON "articles" ("site_code", "slug") WHERE "is_deleted" = false
    `);

    // The duplicate-application check is per brand too.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_job_applications_email_job_live"`,
    );
    await queryRunner.query(`
      CREATE INDEX "idx_job_applications_site_email_job_live"
        ON "job_applications" ("site_code", "email", "job_id")
        WHERE "is_deleted" = false AND "status" NOT IN ('REJECTED','WITHDRAWN')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_job_applications_site_email_job_live"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "vtx_articles_site_slug_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "vtx_job_postings_site_slug_unique"`,
    );

    for (const table of [...this.scopedTables, ...this.scopedMasters]) {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_${table}_site_code"`);
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "vtx_${table}_site_code_fk"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "site_code"`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "vtx_refresh_tokens_site_code_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "role_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "site_code"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_admin_roles_admin_site_live"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "vtx_admin_roles_admin_role_site_unique"`,
    );
    // Rebuilding the narrower rule would fail on anyone holding the same role
    // on two brands, so drop those rows first.
    await queryRunner.query(`
      DELETE FROM "admin_roles" a USING "admin_roles" b
      WHERE a.admin_id = b.admin_id AND a.role_code = b.role_code
        AND a.revoked_at IS NULL AND b.revoked_at IS NULL
        AND a.site_code > b.site_code
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "vtx_admin_roles_admin_id_role_code_unique"
        ON "admin_roles" ("admin_id", "role_code") WHERE "revoked_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_admin_roles_admin_id_live"
        ON "admin_roles" ("admin_id") WHERE "revoked_at" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "admin_roles" DROP CONSTRAINT IF EXISTS "vtx_admin_roles_site_code_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_roles" DROP COLUMN IF EXISTS "site_code"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "site_masters"`);
  }
}
