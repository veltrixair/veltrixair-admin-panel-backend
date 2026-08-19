import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The six questions the design asks that the table could not hold, and the
 * per-posting configuration that decides which questions are asked at all.
 *
 * Both in one migration on purpose. Adding the columns first and the config
 * later would leave a window where applications are collected with no record of
 * what was on the form — and a null answer whose meaning is unrecoverable is
 * worse than a missing column, because it cannot be repaired afterwards.
 *
 * `application_fields` is nullable and null means "the defaults", so every
 * posting that already exists keeps behaving exactly as it did.
 */
export class AddApplicationFieldConfig1785877200000 implements MigrationInterface {
  name = 'AddApplicationFieldConfig1785877200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------- new answers ---
    await queryRunner.query(`
      ALTER TABLE "job_applications"
        ADD COLUMN "current_company"           character varying(150),
        ADD COLUMN "portfolio_url"             character varying(500),
        ADD COLUMN "relevant_experience_years" numeric(4,1),
        ADD COLUMN "key_skills"                text[],
        ADD COLUMN "current_ctc"               character varying(60),
        ADD COLUMN "willing_to_relocate"       boolean
    `);

    // Free text rather than a number, matching the design. Current pay is the
    // question candidates answer with "negotiable", "confidential" or
    // "SAR 30k/month", and forcing it numeric loses all three. Expected salary
    // stays numeric because that one is filtered and compared.
    await queryRunner.query(`
      COMMENT ON COLUMN "job_applications"."current_ctc" IS
        'Free text by design — candidates answer this with words as often as numbers'
    `);

    // Nullable throughout: a question that was not asked has no answer, and
    // that is a different thing from an answer left blank. Which of the two it
    // is can be read off the posting's application_fields.
    await queryRunner.query(`
      COMMENT ON COLUMN "job_applications"."willing_to_relocate" IS
        'NULL means the question was not asked, not "no"'
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_job_applications_key_skills"
        ON "job_applications" USING GIN ("key_skills")
    `);

    // ------------------------------------------- answers that may not exist ---
    // Every one of these belongs to a question a posting can switch off, so
    // NOT NULL is no longer true of them. This is the half of the feature that
    // is easy to miss: without it, turning a question off makes the form
    // unsubmittable rather than shorter.
    for (const column of [
      'phone',
      'current_title',
      'qualification_code',
      'experience_years',
      'city',
      'country_code',
      'notice_period_code',
      'work_authorisation_code',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "job_applications" ALTER COLUMN "${column}" DROP NOT NULL`,
      );
    }

    // ------------------------------------------------------- the toggles ---
    // JSONB rather than sixteen boolean pairs: the catalogue lives in code, so
    // adding a seventeenth question should be a constants change, not another
    // migration. The database cannot police the shape, which is why
    // UpdateApplicationFieldsDto validates every key against the catalogue.
    await queryRunner.query(`
      ALTER TABLE "job_postings" ADD COLUMN "application_fields" jsonb
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "job_postings"."application_fields" IS
        'Which questions this role asks. NULL means the defaults in application-fields.constants.ts'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_postings" DROP COLUMN IF EXISTS "application_fields"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_job_applications_key_skills"
    `);

    // An application missing any of these could only have been submitted to a
    // posting that switched the question off, which is a thing only this
    // migration made possible. They are removed rather than backfilled: a
    // placeholder answer would be an invented one.
    await queryRunner.query(`
      DELETE FROM "job_application_events"
       WHERE "application_id" IN (
         SELECT "id" FROM "job_applications"
          WHERE "phone" IS NULL OR "current_title" IS NULL
             OR "qualification_code" IS NULL OR "experience_years" IS NULL
             OR "city" IS NULL OR "country_code" IS NULL
             OR "notice_period_code" IS NULL OR "work_authorisation_code" IS NULL
       )
    `);
    await queryRunner.query(`
      DELETE FROM "job_applications"
       WHERE "phone" IS NULL OR "current_title" IS NULL
          OR "qualification_code" IS NULL OR "experience_years" IS NULL
          OR "city" IS NULL OR "country_code" IS NULL
          OR "notice_period_code" IS NULL OR "work_authorisation_code" IS NULL
    `);
    for (const column of [
      'phone',
      'current_title',
      'qualification_code',
      'experience_years',
      'city',
      'country_code',
      'notice_period_code',
      'work_authorisation_code',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "job_applications" ALTER COLUMN "${column}" SET NOT NULL`,
      );
    }
    await queryRunner.query(`
      ALTER TABLE "job_applications"
        DROP COLUMN IF EXISTS "current_company",
        DROP COLUMN IF EXISTS "portfolio_url",
        DROP COLUMN IF EXISTS "relevant_experience_years",
        DROP COLUMN IF EXISTS "key_skills",
        DROP COLUMN IF EXISTS "current_ctc",
        DROP COLUMN IF EXISTS "willing_to_relocate"
    `);
  }
}
