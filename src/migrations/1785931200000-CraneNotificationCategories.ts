import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Categories for the brands that are not IT.
 *
 * The first cut of the feed took its five headings from the IT dashboard —
 * contact, jobs, architect, insights, system — which quietly assumed every
 * brand's work looked like IT's. It does not. The crane business runs on quote
 * requests and site visits, neither of which is any of those five, so a crane
 * administrator was offered chips that could never fill and none for the two
 * things they actually wait on.
 *
 * Adding to the category list rather than making it per-site: a category is a
 * heading on a screen, and several brands legitimately share one. A crane job
 * application and an IT one are both "Careers" and belong under the same chip.
 * What separates them is `feature_code`, which already does that job — crane
 * applications answer to CRANE_APPLICATIONS, IT's to IT_APPLICATIONS, and no
 * role holds both by accident.
 *
 * Which chips a dashboard *shows* is a presentation question and stays in the
 * client, where changing it costs nothing.
 */
export class CraneNotificationCategories1785931200000
  implements MigrationInterface
{
  name = 'CraneNotificationCategories1785931200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "vtx_notifications_category_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "notifications" ADD CONSTRAINT "vtx_notifications_category_check"
        CHECK ("category" IN ('contact','jobs','architect','insights','system',
                              'quotes','visits'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rows in the departing categories would violate the narrower constraint.
    // They are notifications, not records — the quote or visit they point at
    // is untouched, so dropping them loses nothing but the announcement.
    await queryRunner.query(
      `DELETE FROM "notifications" WHERE "category" IN ('quotes','visits')`,
    );

    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "vtx_notifications_category_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "notifications" ADD CONSTRAINT "vtx_notifications_category_check"
        CHECK ("category" IN ('contact','jobs','architect','insights','system'))
    `);
  }
}
