import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * File storage: a registry of stored objects and the leads captured for gated
 * downloads, plus the link from a whitepaper article to its PDF.
 *
 * The registry exists because retention and erasure need it. The reference
 * backend returns a storage key and lets the caller keep it, with no central
 * record — workable there, but an object nobody has a row for is an object
 * nobody can purge on a schedule or delete on request.
 *
 * RESUME appears in the purpose list without being reachable yet: job
 * applications arrive with careers Scope B. Its policy is decided here rather
 * than improvised later.
 */
export class CreateFilesModule1785830400000 implements MigrationInterface {
  name = 'CreateFilesModule1785830400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stored_files" (
        "id"              uuid NOT NULL DEFAULT gen_random_uuid(),
        "storage_key"     character varying(300) NOT NULL,
        "storage_driver"  character varying(20) NOT NULL,
        "original_name"   character varying(255) NOT NULL,
        "mime_type"       character varying(100) NOT NULL,
        "size_bytes"      integer NOT NULL,
        "checksum_sha256" character varying(64) NOT NULL,
        "purpose"         character varying(30) NOT NULL,
        "scan_status"     character varying(10) NOT NULL DEFAULT 'PENDING',
        "scanned_at"      timestamptz,
        "uploaded_by"     character varying(150),
        "retention_until" timestamptz,
        "is_deleted"      boolean NOT NULL DEFAULT false,
        "deleted_at"      timestamptz,
        "created_date"    timestamptz NOT NULL DEFAULT now(),
        "updated_date"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_stored_files_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_stored_files_storage_key_unique" UNIQUE ("storage_key"),
        CONSTRAINT "vtx_stored_files_purpose_check"
          CHECK ("purpose" IN ('WHITEPAPER','CAPABILITY_STATEMENT','RESUME')),
        CONSTRAINT "vtx_stored_files_scan_status_check"
          CHECK ("scan_status" IN ('PENDING','CLEAN','INFECTED','FAILED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "asset_download_requests" (
        "id"                     uuid NOT NULL DEFAULT gen_random_uuid(),
        "file_id"                uuid NOT NULL,
        "context"                character varying(200),
        "full_name"              character varying(150) NOT NULL,
        "company"                character varying(150) NOT NULL,
        "role_title"             character varying(150),
        "work_email"             character varying(255) NOT NULL,
        "consent_at"             timestamptz NOT NULL,
        "privacy_notice_version" character varying(50) NOT NULL,
        "source_page"            character varying(500),
        "utm_source"             character varying(100),
        "utm_medium"             character varying(100),
        "utm_campaign"           character varying(100),
        "ip_hash"                character varying(64),
        "user_agent"             character varying(500),
        "spam_score"             integer NOT NULL DEFAULT 0,
        "created_date"           timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_asset_download_requests_id_pk" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "asset_download_requests"
        ADD CONSTRAINT "vtx_asset_download_requests_file_id_fk"
        FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE CASCADE
    `);

    // SET NULL rather than RESTRICT: deleting a file should orphan the article's
    // asset link, not block the deletion. An erasure request must always win.
    await queryRunner.query(
      `ALTER TABLE "articles" ADD COLUMN "asset_file_id" uuid`,
    );
    await queryRunner.query(`
      ALTER TABLE "articles" ADD CONSTRAINT "vtx_articles_asset_file_id_fk"
      FOREIGN KEY ("asset_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_stored_files_purpose" ON "stored_files" ("purpose")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_stored_files_scan_status" ON "stored_files" ("scan_status")`,
    );
    // Drives the retention purge.
    await queryRunner.query(`
      CREATE INDEX "idx_stored_files_retention_until"
        ON "stored_files" ("retention_until")
        WHERE "retention_until" IS NOT NULL AND "is_deleted" = false
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_asset_download_requests_file_id" ON "asset_download_requests" ("file_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_asset_download_requests_work_email" ON "asset_download_requests" ("work_email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_articles_asset_file_id" ON "articles" ("asset_file_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "vtx_articles_asset_file_id_fk"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_articles_asset_file_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "articles" DROP COLUMN IF EXISTS "asset_file_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "asset_download_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stored_files"`);
  }
}
