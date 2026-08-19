import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets stored files be tagged as crane quote attachments.
 *
 * `purpose` is a CHECK constraint rather than a master table because it drives
 * behaviour in code — size caps, accepted formats, retention — so a new value
 * is a code change and a migration together, never one without the other.
 */
export class AllowQuoteAttachmentPurpose1785862800000 implements MigrationInterface {
  name = 'AllowQuoteAttachmentPurpose1785862800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stored_files" DROP CONSTRAINT IF EXISTS "vtx_stored_files_purpose_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "stored_files"
        ADD CONSTRAINT "vtx_stored_files_purpose_check"
        CHECK ("purpose" IN ('WHITEPAPER','CAPABILITY_STATEMENT','RESUME','QUOTE_ATTACHMENT'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "stored_files" WHERE "purpose" = 'QUOTE_ATTACHMENT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "stored_files" DROP CONSTRAINT IF EXISTS "vtx_stored_files_purpose_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "stored_files"
        ADD CONSTRAINT "vtx_stored_files_purpose_check"
        CHECK ("purpose" IN ('WHITEPAPER','CAPABILITY_STATEMENT','RESUME'))
    `);
  }
}
