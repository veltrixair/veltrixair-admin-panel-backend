import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives crane site visits a roster of engineers to assign from.
 *
 * `assigned_engineer` was free text, and the one value in it had been typed by
 * hand. Typing is how two spellings of the same person end up in a column
 * nothing can group by.
 *
 * THE OLD COLUMN STAYS, and that is the care in this file. The new
 * `assigned_engineer_id` is what the panel writes from now on, but the text
 * column still holds what was recorded before the roster existed, for visits
 * assigned to somebody who will never be on it — a contractor, a colleague who
 * has since left. Dropping it would erase who attended those visits to tidy up
 * a column, which is the wrong trade.
 *
 * The service lines are the master the public form already offers the
 * customer, so "what was asked for" and "who can do it" use the same words.
 */
export class CraneEngineerRoster1788076800000 implements MigrationInterface {
  name = 'CraneEngineerRoster1788076800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "crane_engineers" (
        "id"               uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_code"        integer NOT NULL,
        "full_name"        character varying(150) NOT NULL,
        "designation"      character varying(150) NOT NULL,
        "email"            character varying(190) NOT NULL,
        "phone"            character varying(30) NOT NULL,
        "experience_years" integer NOT NULL,
        "is_active"        boolean NOT NULL DEFAULT true,
        "is_deleted"       boolean NOT NULL DEFAULT false,
        "deleted_at"       timestamptz,
        "created_date"     timestamptz NOT NULL DEFAULT now(),
        "updated_date"     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_crane_engineers_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_crane_engineers_experience_years_check"
          CHECK ("experience_years" >= 0 AND "experience_years" <= 60)
      )
    `);

    /*
     * One engineer per address, per unit, and case-insensitively.
     *
     * A partial index rather than a plain UNIQUE: a removed engineer should
     * not block re-adding the same person later, and "A.Khan@" and "a.khan@"
     * are one colleague however they were typed.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "vtx_crane_engineers_email_unique"
        ON "crane_engineers" ("site_code", lower("email"))
        WHERE "is_deleted" = false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "crane_engineer_service_lines" (
        "engineer_id"       uuid NOT NULL,
        "service_line_code" integer NOT NULL,
        CONSTRAINT "vtx_crane_engineer_service_lines_pk"
          PRIMARY KEY ("engineer_id", "service_line_code"),
        CONSTRAINT "vtx_crane_engineer_service_lines_engineer_id_fk"
          FOREIGN KEY ("engineer_id") REFERENCES "crane_engineers"("id")
          ON DELETE CASCADE,
        CONSTRAINT "vtx_crane_engineer_service_lines_service_line_code_fk"
          FOREIGN KEY ("service_line_code")
          REFERENCES "crane_service_line_masters"("service_line_code")
          ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_crane_engineer_service_lines_engineer_id"
        ON "crane_engineer_service_lines" ("engineer_id")
    `);

    /*
     * RESTRICT, like every other assignment foreign key here: an engineer with
     * visits against them is deactivated, never deleted, so the visit can
     * still say who attended.
     */
    await queryRunner.query(`
      ALTER TABLE "crane_site_visits"
        ADD COLUMN IF NOT EXISTS "assigned_engineer_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "crane_site_visits"
        ADD CONSTRAINT "vtx_crane_site_visits_assigned_engineer_id_fk"
        FOREIGN KEY ("assigned_engineer_id") REFERENCES "crane_engineers"("id")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_crane_site_visits_assigned_engineer_id"
        ON "crane_site_visits" ("assigned_engineer_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Safe to unwind: the text column was never touched, so every visit still
     * reads the way it did before. Only the roster and the link are lost.
     */
    await queryRunner.query(`
      ALTER TABLE "crane_site_visits"
        DROP CONSTRAINT IF EXISTS "vtx_crane_site_visits_assigned_engineer_id_fk"
    `);
    await queryRunner.query(`
      ALTER TABLE "crane_site_visits"
        DROP COLUMN IF EXISTS "assigned_engineer_id"
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "crane_engineer_service_lines"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "crane_engineers"`);
  }
}
