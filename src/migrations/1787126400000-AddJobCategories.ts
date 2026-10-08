import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives a posting a careers page to appear on.
 *
 * The site has three: Find an Internship, Become a Coach, Explore Experienced
 * Opportunities. Each already asks the API for its own list — the pages send
 * `?category=internship` and so on — but nothing in the schema could answer, so
 * all three would have shown the same roles.
 *
 * A master table rather than a varchar, matching every other option list here:
 * "Internship", "internship" and "Intern" would otherwise become three
 * categories, and the admin form would have no valid set to offer. The slug is
 * what the query string carries, exactly as `practice_area_masters.slug` does
 * for `?practice=`.
 *
 * Deliberately not folded into `practice` or `employment_type`. Practice is the
 * business line — a Platform internship and a Platform senior role are both
 * Platform. Employment type is the basis someone is engaged on, and an
 * internship is also full-time. Three questions, three fields.
 */
export class AddJobCategories1787126400000 implements MigrationInterface {
  name = 'AddJobCategories1787126400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "job_category_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_code"     int NOT NULL,
        "category_code" int NOT NULL,
        "category_name" varchar(100) NOT NULL,
        "slug"          varchar(100) NOT NULL,
        "display_order" int NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_job_category_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_job_category_masters_category_code_unique"
          UNIQUE ("category_code")
      )
    `);

    // The slugs are the ones the careers pages already send; changing them
    // here would silently empty a page.
    await queryRunner.query(`
      INSERT INTO "job_category_masters"
        ("site_code", "category_code", "category_name", "slug", "display_order")
      VALUES
        (101, 101, 'Internship',  'internship',  1),
        (101, 102, 'Coach',       'coach',       2),
        (101, 103, 'Experienced', 'experienced', 3)
    `);

    await queryRunner.query(
      `ALTER TABLE "job_postings" ADD COLUMN "category_code" int`,
    );

    /*
     * Every existing posting becomes Experienced.
     *
     * Accurate rather than merely convenient: the fifteen rows are all senior
     * briefs — Staff Platform Engineer, SOC Analyst Tier 2, Senior Privacy
     * Advisor — and none is an internship or a coaching role. The other two
     * pages therefore keep showing "coming soon" until somebody posts into
     * them, which is the honest state.
     */
    await queryRunner.query(
      `UPDATE "job_postings" SET "category_code" = 103 WHERE "category_code" IS NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE "job_postings" ALTER COLUMN "category_code" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "job_postings"
        ADD CONSTRAINT "vtx_job_postings_category_code_fk"
          FOREIGN KEY ("category_code")
          REFERENCES "job_category_masters" ("category_code")
          ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_job_postings_category_code"
        ON "job_postings" ("category_code")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_job_postings_category_code"`,
    );
    await queryRunner.query(`
      ALTER TABLE "job_postings"
        DROP CONSTRAINT IF EXISTS "vtx_job_postings_category_code_fk"
    `);
    await queryRunner.query(
      `ALTER TABLE "job_postings" DROP COLUMN IF EXISTS "category_code"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "job_category_masters"`);
  }
}
