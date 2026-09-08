import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Let a stored file be a profile photo.
 *
 * `stored_files.purpose` is guarded by a CHECK constraint as well as by the
 * TypeScript union, and the two have to be widened together — adding a member
 * to `FILE_PURPOSES` alone compiles cleanly and then fails at the database on
 * the first upload. Separated from the column migration that precedes it
 * because that one had already run; a constraint is widened forward, not by
 * editing history.
 *
 * The list is restated in full rather than appended to, since a CHECK cannot
 * be added to — it is dropped and rewritten. Anything missing from this list
 * stops being uploadable, so it is the whole set every time.
 */
export class AllowProfilePhotoPurpose1785924000000 implements MigrationInterface {
  name = 'AllowProfilePhotoPurpose1785924000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stored_files" DROP CONSTRAINT IF EXISTS "vtx_stored_files_purpose_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "stored_files" ADD CONSTRAINT "vtx_stored_files_purpose_check"
        CHECK ("purpose" IN ('WHITEPAPER','CAPABILITY_STATEMENT','RESUME',
                             'QUOTE_ATTACHMENT','CERTIFICATE',
                             'EMPLOYEE_DOCUMENT','EMPLOYEE_PAYSLIP',
                             'PROFILE_PHOTO'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Any photo already stored would violate the narrower constraint, so they
    // are detached and removed first — the column is nullable precisely so an
    // account can stand without one.
    await queryRunner.query(
      `UPDATE "admins" SET "avatar_file_id" = NULL WHERE "avatar_file_id" IN
         (SELECT "id" FROM "stored_files" WHERE "purpose" = 'PROFILE_PHOTO')`,
    );
    await queryRunner.query(
      `DELETE FROM "stored_files" WHERE "purpose" = 'PROFILE_PHOTO'`,
    );

    await queryRunner.query(
      `ALTER TABLE "stored_files" DROP CONSTRAINT IF EXISTS "vtx_stored_files_purpose_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "stored_files" ADD CONSTRAINT "vtx_stored_files_purpose_check"
        CHECK ("purpose" IN ('WHITEPAPER','CAPABILITY_STATEMENT','RESUME',
                             'QUOTE_ATTACHMENT','CERTIFICATE',
                             'EMPLOYEE_DOCUMENT','EMPLOYEE_PAYSLIP'))
    `);
  }
}
