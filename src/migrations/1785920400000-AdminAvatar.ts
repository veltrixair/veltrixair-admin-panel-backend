import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A profile photo, on the account rather than the person.
 *
 * The obvious home looks like `employees` — a photo is of a human being, and
 * that is the person-of-record table. It is the wrong one. The four service
 * super-admins were deliberately kept out of `employees`, so a photo filed
 * there could never be set by the accounts most likely to want one, and the
 * sidebar would show initials for exactly the people who use the panel most.
 *
 * There is also already a photo on the employee side: the PHOTO slot in
 * `employee_documents`, which holds a passport-size photograph for the
 * personnel file. That one is evidence, kept for HR and subject to document
 * verification. This one is a display picture the account holder chooses for
 * themselves. Sharing a column between them would make replacing an avatar an
 * edit to somebody's identity documents.
 *
 * ON DELETE SET NULL rather than CASCADE: a purge of the file registry should
 * leave the account standing with no picture, not delete the administrator.
 */
export class AdminAvatar1785920400000 implements MigrationInterface {
  name = 'AdminAvatar1785920400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admins" ADD COLUMN "avatar_file_id" uuid NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "admins" ADD CONSTRAINT "FK_admins_avatar_file" ` +
        `FOREIGN KEY ("avatar_file_id") REFERENCES "stored_files"("id") ` +
        `ON DELETE SET NULL`,
    );

    // Partial: most accounts have no photo, and there is no reason to carry
    // those rows in the index.
    await queryRunner.query(
      `CREATE INDEX "IDX_admins_avatar_file" ON "admins" ("avatar_file_id") ` +
        `WHERE "avatar_file_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admins_avatar_file"`);
    await queryRunner.query(
      `ALTER TABLE "admins" DROP CONSTRAINT IF EXISTS "FK_admins_avatar_file"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admins" DROP COLUMN IF EXISTS "avatar_file_id"`,
    );
  }
}
