import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The department a crane role belongs to, alongside the track it recruits into.
 *
 * These are two different facts about one job and neither replaces the other.
 * A track is candidate-facing — it is what somebody picks on the careers page,
 * which is why "GET — Graduate Engineering Trainee" and "General application —
 * keep on file" are among them. Neither is a department; both are routes into
 * the company. A department is org-facing: which part of the business owns the
 * headcount.
 *
 * Trying to serve both from `track_code` would have meant either losing the
 * two application routes the public form depends on, or listing QHSE beside a
 * graduate programme as though they were the same kind of thing.
 *
 * Nullable, deliberately. The graduate intake and the speculative pile have no
 * department, and the one advert already published predates this column.
 */
export class CraneJobDepartments1785945600000 implements MigrationInterface {
  name = 'CraneJobDepartments1785945600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "crane_department_masters" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4()
          CONSTRAINT "vtx_crane_department_masters_id_pk" PRIMARY KEY,
        "site_code" int NOT NULL DEFAULT 102,
        "department_code" int NOT NULL,
        "department_name" varchar(150) NOT NULL,

        /*
         * The two or three letters the job list prints as a tag. Stored rather
         * than derived: "Inspection & Load Testing" and "Installation" would
         * both initial to IN, and the abbreviation is what people read on a
         * dense table.
         */
        "abbreviation" varchar(4) NOT NULL,

        "display_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_deleted" boolean NOT NULL DEFAULT false,
        "deleted_at" timestamptz NULL,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        "updated_date" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "vtx_crane_department_masters_code_uq" UNIQUE ("department_code")
      )
    `);

    /* Codes in the 2xx band, matching every other crane master table. */
    await queryRunner.query(`
      INSERT INTO "crane_department_masters"
        ("department_code","department_name","abbreviation","display_order") VALUES
        (201, 'Erection & Installation',    'ER', 1),
        (202, 'Service & Maintenance',      'SV', 2),
        (203, 'Inspection & Load Testing',  'IN', 3),
        (204, 'Site Operations',            'OP', 4),
        (205, 'QHSE',                       'QH', 5),
        (206, 'Projects & Engineering',     'PR', 6)
    `);

    await queryRunner.query(
      `ALTER TABLE "crane_job_postings" ADD COLUMN "department_code" int NULL`,
    );

    /*
     * RESTRICT, like every other master reference here: a department with
     * roles filed under it should not be removable without somebody first
     * deciding where those roles go.
     */
    await queryRunner.query(
      `ALTER TABLE "crane_job_postings"
         ADD CONSTRAINT "vtx_crane_job_postings_department_code_fk"
         FOREIGN KEY ("department_code")
         REFERENCES "crane_department_masters"("department_code")
         ON DELETE RESTRICT`,
    );

    /*
     * The one advert already published is an installation engineer, which is
     * Erection & Installation. Set rather than left null so the list has
     * something to show the day this ships.
     */
    await queryRunner.query(
      `UPDATE "crane_job_postings" SET "department_code" = 201
        WHERE "department_code" IS NULL AND "track_code" = 201`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "crane_job_postings"
        DROP CONSTRAINT IF EXISTS "vtx_crane_job_postings_department_code_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crane_job_postings" DROP COLUMN IF EXISTS "department_code"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "crane_department_masters"`);
  }
}
