import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets the server issue a job reference, and stops demanding a location label.
 *
 * Both fields were required of a create that could never supply them, so
 * creating a posting from the admin panel returned a 400 every time. The panel
 * was not wrong to omit them: its reference field is disabled and reads
 * "Issued on save", and the location label is an optional display string — the
 * chips are what decide which filters find a role.
 *
 * The sequence continues the existing `R-NNN` series rather than switching to
 * the house `VLX-2026-000001` shape. Two live postings carry R-900 and R-901;
 * renumbering them is not on the table, and a format that changes halfway
 * through a list is worse than one that is merely short. `setval` is given the
 * highest number already in use, so the next draw is R-902 — and GREATEST
 * guards the case where those rows have been deleted on some environment.
 *
 * Codes that do not match the pattern — the ZZP/ZZY imports — are ignored by
 * the regex rather than parsed. They were never part of a series.
 */
export class JobRefCodeSequence1787644800000 implements MigrationInterface {
  name = 'JobRefCodeSequence1787644800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "job_ref_code_seq"`);

    await queryRunner.query(`
      SELECT setval(
        'job_ref_code_seq',
        GREATEST(
          901,
          COALESCE((
            SELECT MAX((substring("ref_code" from '^R-([0-9]+)$'))::int)
            FROM "job_postings"
            WHERE "ref_code" ~ '^R-[0-9]+$'
          ), 0)
        )
      )
    `);

    /*
     * The label is what the advert prints, and plenty of roles are content with
     * the city chips alone. Existing blanks become NULL so "no label" is one
     * state rather than two.
     */
    await queryRunner.query(
      `ALTER TABLE "job_postings" ALTER COLUMN "location_label" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "job_postings" SET "location_label" = NULL WHERE "location_label" = ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "job_postings" SET "location_label" = '' WHERE "location_label" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_postings" ALTER COLUMN "location_label" SET NOT NULL`,
    );
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "job_ref_code_seq"`);
  }
}
