import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two unrelated corrections the admin panel asked for.
 *
 * 1. A job posting must carry a description. Once `summary`,
 *    `responsibilities` and `requirements` were folded into `description_mdx`,
 *    that column became the only place a role is described — and it was still
 *    nullable, so a posting could reach the careers page as a bare job title.
 *    All 14 live postings already have one, so this tightens without touching
 *    a row.
 *
 * 2. Crane quotes gain a REVERTED status — "Reverted back" on the pipeline
 *    dropdown. It is not terminal: unlike WITHDRAWN, a reverted quote can move
 *    to any other status afterwards, which is the whole point of it.
 */
export class JobDescriptionRequiredAndRevertedQuotes1785902400000 implements MigrationInterface {
  name = 'JobDescriptionRequiredAndRevertedQuotes1785902400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Belt and braces. The count is zero today, but a migration that assumes
    // the data is clean is a migration that fails on someone else's database.
    await queryRunner.query(`
      UPDATE "job_postings"
         SET "description_mdx" = 'Description to follow.'
       WHERE "description_mdx" IS NULL OR btrim("description_mdx") = ''
    `);

    await queryRunner.query(`
      ALTER TABLE "job_postings"
        ALTER COLUMN "description_mdx" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "crane_quote_requests"
        DROP CONSTRAINT IF EXISTS "vtx_crane_quote_requests_status_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "crane_quote_requests"
        ADD CONSTRAINT "vtx_crane_quote_requests_status_check"
        CHECK ("status" IN (
          'NEW','TRIAGE','SITE_VISIT','PROPOSAL_SENT',
          'WON','LOST','REVERTED','WITHDRAWN'
        ))
    `);
  }

  /**
   * Reverting sends any REVERTED quote back to PROPOSAL_SENT.
   *
   * That is where one gets to — a proposal went out and came back — so it is
   * the honest place to land rather than NEW, which would restart a pipeline
   * that has already run most of its course.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "crane_quote_requests"
         SET "status" = 'PROPOSAL_SENT'
       WHERE "status" = 'REVERTED'
    `);
    await queryRunner.query(`
      ALTER TABLE "crane_quote_requests"
        DROP CONSTRAINT IF EXISTS "vtx_crane_quote_requests_status_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "crane_quote_requests"
        ADD CONSTRAINT "vtx_crane_quote_requests_status_check"
        CHECK ("status" IN (
          'NEW','TRIAGE','SITE_VISIT','PROPOSAL_SENT',
          'WON','LOST','WITHDRAWN'
        ))
    `);

    await queryRunner.query(`
      ALTER TABLE "job_postings"
        ALTER COLUMN "description_mdx" DROP NOT NULL
    `);
  }
}
