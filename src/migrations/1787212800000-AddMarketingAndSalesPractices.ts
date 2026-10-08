import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds Marketing and Sales to the practice list for the IT unit.
 *
 * Continues the existing numbering — the eight rows run 101 to 108 — and takes
 * the next two display positions, so the two appear after Ops rather than
 * reordering anything already on the careers pages.
 */
export class AddMarketingAndSalesPractices1787212800000 implements MigrationInterface {
  name = 'AddMarketingAndSalesPractices1787212800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "practice_area_masters"
        ("site_code", "practice_code", "practice_name", "slug", "display_order")
      VALUES
        (101, 109, 'Marketing', 'marketing', 9),
        (101, 110, 'Sales',     'sales',     10)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Deleted rather than deactivated, because this reverses an insert.
     *
     * The foreign key from job_postings is ON DELETE RESTRICT, so if a posting
     * has been filed under either practice in the meantime this fails loudly
     * instead of orphaning it — which is the right outcome: the posting has to
     * be moved to another practice first, and that is a decision, not a
     * migration's to make.
     */
    await queryRunner.query(`
      DELETE FROM "practice_area_masters"
       WHERE "site_code" = 101 AND "practice_code" IN (109, 110)
    `);
  }
}
