import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The CV moves onto the form, and certificates become files.
 *
 * Crane applications used to take no CV at all — the acknowledgement asked the
 * candidate to reply with it attached, and an admin put it on the record. That
 * worked only as well as the mail transport, which does not yet deliver, so in
 * practice every application arrived without one. The upload now happens at
 * submit, the way IT has always done it.
 *
 * `cv_file_id` deliberately stays NULLABLE. One application already exists from
 * before this change and legitimately has no CV; making the column NOT NULL
 * would mean deleting a real submission or inventing a file to satisfy the
 * constraint. The requirement belongs in the service, where "an application
 * made today must carry a CV" can be true without rewriting what happened
 * yesterday.
 */
export class CraneApplicationUploads1785895200000 implements MigrationInterface {
  name = 'CraneApplicationUploads1785895200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A certificate is a distinct kind of file: image formats are accepted for
    // it and nowhere else, and it inherits the application's twelve-month PDPL
    // retention rather than a document's.
    await queryRunner.query(`
      ALTER TABLE "stored_files"
        DROP CONSTRAINT IF EXISTS "vtx_stored_files_purpose_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "stored_files"
        ADD CONSTRAINT "vtx_stored_files_purpose_check"
        CHECK ("purpose" IN ('WHITEPAPER','CAPABILITY_STATEMENT','RESUME','QUOTE_ATTACHMENT','CERTIFICATE'))
    `);

    /*
     * Up to four certificates per application, held the way crane quote
     * attachments already are: a join table carrying nothing but the link.
     *
     * The cap is NOT here. A composite primary key can stop the same file being
     * attached twice, but it cannot count — and a trigger enforcing "at most
     * four" would put a product rule somewhere nobody thinks to look when it
     * becomes five. The service enforces it.
     */
    await queryRunner.query(`
      CREATE TABLE "crane_application_certificates" (
        "application_id" uuid NOT NULL,
        "file_id"        uuid NOT NULL,
        "created_date"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_crane_application_certificates_pk"
          PRIMARY KEY ("application_id", "file_id"),
        CONSTRAINT "vtx_crane_application_certificates_application_id_fk"
          FOREIGN KEY ("application_id")
          REFERENCES "crane_applications"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_crane_application_certificates_file_id_fk"
          FOREIGN KEY ("file_id")
          REFERENCES "stored_files"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_crane_application_certificates_file"
        ON "crane_application_certificates" ("file_id")
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "crane_applications"."cv_file_id" IS
        'Required at submit since Aug 2026. Null only on applications that predate that.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "crane_application_certificates"`,
    );
    // Certificates would violate the narrower CHECK, and they are the only
    // rows that could — nothing else uses this purpose.
    await queryRunner.query(
      `DELETE FROM "stored_files" WHERE "purpose" = 'CERTIFICATE'`,
    );
    await queryRunner.query(`
      ALTER TABLE "stored_files"
        DROP CONSTRAINT IF EXISTS "vtx_stored_files_purpose_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "stored_files"
        ADD CONSTRAINT "vtx_stored_files_purpose_check"
        CHECK ("purpose" IN ('WHITEPAPER','CAPABILITY_STATEMENT','RESUME','QUOTE_ATTACHMENT'))
    `);
  }
}
