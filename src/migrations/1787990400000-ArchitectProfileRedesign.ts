import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The domains an architect can be filed under, codes 101 upwards in this order.
 *
 * A list of its own rather than rows added to `industry_masters`: that table
 * asks a visitor what business they are in, and adding "Design Solution" to it
 * would put it in the contact form's dropdown in front of every enquirer.
 */
const ARCHITECT_INDUSTRIES = [
  'Data Privacy',
  'Hotel Management',
  'Human Resource',
  'Retail Management',
  'Design Solution',
  'Education Research',
  'Enterprise Software',
];

/**
 * Re-cuts an architect into the record the desk actually keeps.
 *
 *   full name · email · phone · designation · industries · experience
 *
 * WHAT GOES, AND WHY IT IS SAFE TO LOSE
 *
 * `practice_code` and the `architect_practices` link: the visitor used to pick
 * a practice and be shown that practice's architect. They no longer pick one —
 * a booking is a request for an hour, and the desk assigns afterwards — so the
 * link was describing a journey that no longer happens.
 *
 * `office_code`: it existed to compute the deliverables SLA on the right
 * working week, and the deliverables date is gone.
 *
 * `slug`: nothing read it. It addressed public architect pages that were never
 * built, and the only code touching it was the check that it stayed unique.
 *
 * `credentials`: a free-text line shown on those same pages.
 *
 * WHAT STAYS NULLABLE, AND WHY THAT IS NOT AN OVERSIGHT
 *
 * Email, phone, experience and industries are required of every architect
 * created from now on — the DTO enforces it. The columns are nullable because
 * nine architects already exist and nobody has those answers for them yet. The
 * alternative was inventing an email address per row, which would put nine
 * made-up contact details into a table the desk reads as fact. They are better
 * visibly blank until somebody fills them in.
 *
 * `display_title` is renamed rather than dropped and re-added: it already
 * holds exactly what designation means ("Senior Architect — Data Privacy"),
 * and a rename keeps that for all nine rows where a drop would discard it.
 */
export class ArchitectProfileRedesign1787990400000 implements MigrationInterface {
  name = 'ArchitectProfileRedesign1787990400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- designation --------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "architects" RENAME COLUMN "display_title" TO "designation"
    `);

    // --- the new facts -------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "architects"
        ADD COLUMN IF NOT EXISTS "email"            varchar(190),
        ADD COLUMN IF NOT EXISTS "phone"            varchar(30),
        ADD COLUMN IF NOT EXISTS "experience_years" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "architects"
        ADD CONSTRAINT "vtx_architects_experience_years_check"
        CHECK ("experience_years" IS NULL
               OR ("experience_years" >= 0 AND "experience_years" <= 60))
    `);

    // --- the industries an architect can be filed under ----------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "architect_industry_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "industry_code" integer NOT NULL,
        "industry_name" character varying(100) NOT NULL,
        "site_code"     integer NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_architect_industry_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_architect_industry_masters_code_unique"
          UNIQUE ("industry_code")
      )
    `);

    for (const [i, name] of ARCHITECT_INDUSTRIES.entries()) {
      await queryRunner.query(
        `INSERT INTO "architect_industry_masters"
           ("industry_code", "industry_name", "site_code", "display_order")
         VALUES ($1, $2, 101, $3)
         ON CONFLICT ("industry_code") DO NOTHING`,
        [101 + i, name, i + 1],
      );
    }

    // --- industries, many per architect --------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "architect_industries" (
        "architect_id"  uuid NOT NULL,
        "industry_code" integer NOT NULL,
        CONSTRAINT "vtx_architect_industries_pk"
          PRIMARY KEY ("architect_id", "industry_code"),
        CONSTRAINT "vtx_architect_industries_architect_id_fk"
          FOREIGN KEY ("architect_id") REFERENCES "architects"("id")
          ON DELETE CASCADE,
        CONSTRAINT "vtx_architect_industries_industry_code_fk"
          FOREIGN KEY ("industry_code")
          REFERENCES "architect_industry_masters"("industry_code")
          ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_architect_industries_architect_id"
        ON "architect_industries" ("architect_id")
    `);

    // --- what the desk no longer records -------------------------------
    await queryRunner.query(`DROP TABLE IF EXISTS "architect_practices"`);
    await queryRunner.query(`
      ALTER TABLE "architects"
        DROP CONSTRAINT IF EXISTS "vtx_architects_practice_code_fk",
        DROP CONSTRAINT IF EXISTS "vtx_architects_office_code_fk",
        DROP CONSTRAINT IF EXISTS "vtx_architects_slug_unique"
    `);
    await queryRunner.query(`
      ALTER TABLE "architects"
        DROP COLUMN IF EXISTS "practice_code",
        DROP COLUMN IF EXISTS "office_code",
        DROP COLUMN IF EXISTS "slug",
        DROP COLUMN IF EXISTS "credentials"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * The structure comes back; the content cannot.
     *
     * Which practices each architect covered, which office they sat in and
     * what their slug was are dropped by `up` and stored nowhere else, so this
     * direction restores empty columns. `slug` in particular was UNIQUE and
     * NOT NULL, and nine rows with no slug cannot satisfy that — it returns
     * nullable, which is as close as an undo can honestly get.
     *
     * This exists to unwind a bad deploy, not as a routine step.
     */
    await queryRunner.query(`
      ALTER TABLE "architects"
        ADD COLUMN IF NOT EXISTS "slug"        varchar(120),
        ADD COLUMN IF NOT EXISTS "credentials" varchar(500),
        ADD COLUMN IF NOT EXISTS "office_code" integer
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "architect_practices" (
        "architect_id"  uuid NOT NULL,
        "practice_code" integer NOT NULL,
        CONSTRAINT "vtx_architect_practices_pk"
          PRIMARY KEY ("architect_id", "practice_code"),
        CONSTRAINT "vtx_architect_practices_architect_id_fk"
          FOREIGN KEY ("architect_id") REFERENCES "architects"("id")
          ON DELETE CASCADE,
        CONSTRAINT "vtx_architect_practices_practice_code_fk"
          FOREIGN KEY ("practice_code")
          REFERENCES "discovery_practice_masters"("practice_code")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "architect_industries"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "architect_industry_masters"`,
    );
    await queryRunner.query(`
      ALTER TABLE "architects"
        DROP CONSTRAINT IF EXISTS "vtx_architects_experience_years_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "architects"
        DROP COLUMN IF EXISTS "email",
        DROP COLUMN IF EXISTS "phone",
        DROP COLUMN IF EXISTS "experience_years"
    `);
    await queryRunner.query(`
      ALTER TABLE "architects" RENAME COLUMN "designation" TO "display_title"
    `);
  }
}
