import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Brings the job application table in line with the form the website actually
 * shows.
 *
 * Two changes, both of them the backend moving to meet the frontend rather
 * than the other way round:
 *
 *   1. `first_name` + `last_name` become one `full_name`, because the form asks
 *      for one name and splitting a string on whitespace is a guess that is
 *      wrong often enough to matter across the regions these postings run in.
 *
 *   2. Total and relevant experience become band codes against a new master,
 *      because the form offers a dropdown, not a number. The numeric columns
 *      stay and are now derived from the band's lower bound — the admin list
 *      filters on ">= N years" and a band alone cannot answer that.
 *
 * Qualification, notice period and expected CTC are deliberately untouched:
 * those stay coded/numeric on this side and the form changes instead.
 */
export class ApplicationNameAndExperienceBands1786780800000 implements MigrationInterface {
  name = 'ApplicationNameAndExperienceBands1786780800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- 1. one name column -------------------------------------------------

    await queryRunner.query(`
      ALTER TABLE "job_applications" ADD COLUMN "full_name" varchar(100)
    `);

    // Joined with a single space and trimmed, so a row that only ever had one
    // half does not end up with a leading or trailing gap. Truncated to the
    // column width rather than failing the migration: an over-long combined
    // name is a data artefact of the old two-field shape, not a reason to stop.
    await queryRunner.query(`
      UPDATE "job_applications"
         SET "full_name" = LEFT(
               BTRIM(COALESCE("first_name", '') || ' ' || COALESCE("last_name", '')),
               100
             )
    `);

    // Any row that somehow had neither half would now be blank, and the column
    // is about to go NOT NULL. There should be none; this is here so that if
    // there are, the migration says so instead of failing on a constraint.
    const blank = (await queryRunner.query(`
      SELECT count(*)::text AS count FROM "job_applications" WHERE "full_name" = ''
    `)) as { count: string }[];
    if (Number(blank[0].count) > 0) {
      throw new Error(
        `${blank[0].count} job_applications row(s) have no name at all. ` +
          'Fix or remove them before running this migration.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE "job_applications" ALTER COLUMN "full_name" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "job_applications"
        DROP COLUMN "first_name",
        DROP COLUMN "last_name"
    `);

    // --- 2. the experience band master -------------------------------------

    await queryRunner.query(`
      CREATE TABLE "experience_band_masters" (
        "id"                     uuid NOT NULL DEFAULT gen_random_uuid(),
        "experience_band_code"   int NOT NULL,
        "experience_band_name"   varchar(50) NOT NULL,
        "min_years"              numeric(4,1) NOT NULL,
        "available_for_relevant" boolean NOT NULL DEFAULT true,
        "display_order"          int NOT NULL DEFAULT 0,
        "is_active"              boolean NOT NULL DEFAULT true,
        "is_deleted"             boolean NOT NULL DEFAULT false,
        "deleted_at"             timestamptz,
        "created_date"           timestamptz NOT NULL DEFAULT now(),
        "updated_date"           timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_experience_band_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_experience_band_masters_experience_band_code_unique"
          UNIQUE ("experience_band_code"),
        CONSTRAINT "vtx_experience_band_masters_min_years_check"
          CHECK ("min_years" >= 0 AND "min_years" <= 60)
      )
    `);

    // The labels are the website's, character for character — including the en
    // dashes. The dropdown the candidate sees and the row stored against them
    // should read the same, and a hyphen here would quietly make them differ.
    //
    // min_years is the band's lower bound. Fresher and "0-1 year" both sit at
    // zero: neither claims a completed year. availableForRelevant is false only
    // for Fresher, which is the whole of the "same list minus Fresher" rule.
    await queryRunner.query(`
      INSERT INTO "experience_band_masters"
        ("experience_band_code", "experience_band_name", "min_years",
         "available_for_relevant", "display_order")
      VALUES
        (101, 'Fresher',      0,  false, 1),
        (102, '0–1 year',     0,  true,  2),
        (103, '1–3 years',    1,  true,  3),
        (104, '3–5 years',    3,  true,  4),
        (105, '5–7 years',    5,  true,  5),
        (106, '7–10 years',   7,  true,  6),
        (107, '10–15 years', 10,  true,  7),
        (108, '15+ years',   15,  true,  8)
    `);

    // --- 3. band columns on the application --------------------------------

    await queryRunner.query(`
      ALTER TABLE "job_applications"
        ADD COLUMN "experience_band_code" int,
        ADD COLUMN "relevant_experience_band_code" int
    `);

    /*
     * Backfill from the numbers already stored, by picking the band whose lower
     * bound is the highest one at or below the recorded figure. That is the
     * band the candidate would have chosen, given these bounds.
     *
     * Fresher is excluded from both sides of the backfill: at 0 years the
     * numeric column cannot distinguish "fresher" from "under one year", and
     * "0–1 year" is the safer of the two to assume. Nobody is labelled a
     * fresher by a migration.
     */
    for (const [yearsColumn, bandColumn] of [
      ['experience_years', 'experience_band_code'],
      ['relevant_experience_years', 'relevant_experience_band_code'],
    ]) {
      await queryRunner.query(`
        UPDATE "job_applications" a
           SET "${bandColumn}" = (
                 SELECT b."experience_band_code"
                   FROM "experience_band_masters" b
                  WHERE b."available_for_relevant" = true
                    AND b."min_years" <= a."${yearsColumn}"
                  ORDER BY b."min_years" DESC
                  LIMIT 1
               )
         WHERE a."${yearsColumn}" IS NOT NULL
      `);
    }

    await queryRunner.query(`
      ALTER TABLE "job_applications"
        ADD CONSTRAINT "vtx_job_applications_experience_band_code_fk"
          FOREIGN KEY ("experience_band_code")
          REFERENCES "experience_band_masters" ("experience_band_code")
          ON DELETE RESTRICT,
        ADD CONSTRAINT "vtx_job_applications_relevant_experience_band_code_fk"
          FOREIGN KEY ("relevant_experience_band_code")
          REFERENCES "experience_band_masters" ("experience_band_code")
          ON DELETE RESTRICT
    `);

    // Fresher is not a legal answer to "of that, how much is relevant" — the
    // service refuses it, and this makes it unrepresentable rather than merely
    // rejected on one code path.
    await queryRunner.query(`
      ALTER TABLE "job_applications"
        ADD CONSTRAINT "vtx_job_applications_relevant_band_not_fresher_check"
          CHECK ("relevant_experience_band_code" IS NULL
                 OR "relevant_experience_band_code" <> 101)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_applications"
        DROP CONSTRAINT IF EXISTS "vtx_job_applications_relevant_band_not_fresher_check",
        DROP CONSTRAINT IF EXISTS "vtx_job_applications_experience_band_code_fk",
        DROP CONSTRAINT IF EXISTS "vtx_job_applications_relevant_experience_band_code_fk"
    `);
    await queryRunner.query(`
      ALTER TABLE "job_applications"
        DROP COLUMN IF EXISTS "experience_band_code",
        DROP COLUMN IF EXISTS "relevant_experience_band_code"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "experience_band_masters"`);

    // The name split cannot be recovered — one string does not tell you where
    // the boundary was. Everything goes back into first_name, which is at least
    // lossless as to the characters, and last_name gets an empty string so the
    // NOT NULL the old schema had still holds.
    await queryRunner.query(`
      ALTER TABLE "job_applications"
        ADD COLUMN "first_name" varchar(100),
        ADD COLUMN "last_name"  varchar(100)
    `);
    await queryRunner.query(`
      UPDATE "job_applications"
         SET "first_name" = "full_name", "last_name" = ''
    `);
    await queryRunner.query(`
      ALTER TABLE "job_applications"
        ALTER COLUMN "first_name" SET NOT NULL,
        ALTER COLUMN "last_name"  SET NOT NULL,
        DROP COLUMN "full_name"
    `);
  }
}
