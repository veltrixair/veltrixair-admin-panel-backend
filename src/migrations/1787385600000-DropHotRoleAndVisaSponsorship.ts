import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops two fields from IT job postings that nothing asks for any more.
 *
 *   `hot_role`        — a "featured" flag. It drove the default sort (hot
 *                       first, then curated order) and a ?hotOnly= filter the
 *                       website never used. Ordering is now the curated one a
 *                       recruiter arranges in the panel, which is the only
 *                       sequence anybody was actually setting.
 *
 *   `visa_sponsorship` — whether the posting offered sponsorship. The question
 *                       is asked of the candidate instead, through
 *                       work_authorisation_masters, which is the more useful
 *                       end of it: what someone is already entitled to do
 *                       decides more than what a posting is willing to fund.
 *
 * The crane brand has its own `crane_job_postings.hot_role` and is untouched —
 * a different table, a different website, and not part of this change.
 */
export class DropHotRoleAndVisaSponsorship1787385600000 implements MigrationInterface {
  name = 'DropHotRoleAndVisaSponsorship1787385600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_job_postings_hot_role"`);
    await queryRunner.query(`
      ALTER TABLE "job_postings"
        DROP COLUMN IF EXISTS "hot_role",
        DROP COLUMN IF EXISTS "visa_sponsorship"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Both come back empty rather than guessed at. Which postings were once
     * featured, and which offered sponsorship, is not recoverable from
     * anything left in the table — `false` and `null` say "we do not know",
     * which is true, where an invented value would not be.
     */
    await queryRunner.query(`
      ALTER TABLE "job_postings"
        ADD COLUMN "hot_role" boolean NOT NULL DEFAULT false,
        ADD COLUMN "visa_sponsorship" boolean
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_job_postings_hot_role"
        ON "job_postings" ("hot_role")
    `);
  }
}
