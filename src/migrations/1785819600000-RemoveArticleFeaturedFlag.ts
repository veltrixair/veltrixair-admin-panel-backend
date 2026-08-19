import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the `featured` flag from articles.
 *
 * Which card is promoted to the hero slot is a presentation decision the
 * frontend owns, not editorial data the backend should hold. Keeping the
 * column would leave a field nothing writes and nothing reads.
 */
export class RemoveArticleFeaturedFlag1785819600000 implements MigrationInterface {
  name = 'RemoveArticleFeaturedFlag1785819600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_articles_featured"`);
    await queryRunner.query(
      `ALTER TABLE "articles" DROP COLUMN IF EXISTS "featured"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "articles" ADD COLUMN "featured" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_articles_featured" ON "articles" ("featured")`,
    );
    // The previously promoted card cannot be recovered — it is reinstated as
    // the most recently published piece, which is what it was.
    await queryRunner.query(`
      UPDATE "articles" SET "featured" = true
      WHERE id = (
        SELECT id FROM "articles"
        WHERE status = 'PUBLISHED' AND is_deleted = false
        ORDER BY published_at DESC LIMIT 1
      )
    `);
  }
}
