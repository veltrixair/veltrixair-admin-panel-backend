import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A feed heading for "Book a demo" submissions from the kNODE website.
 *
 * The website popup and the product deck are two different frontends on this
 * one backend, and their submissions are announced under two different
 * categories — `knodeDemo` here, `knode` for the deck — so the dashboard can
 * offer them as separate chips. The service has raised `knodeDemo` since
 * KnodeBookDemo landed, and the entity lists it, but the category constraint
 * was last widened for `knode` and never for this one. Every raise therefore
 * failed the CHECK, was caught and logged by NotificationService.raise, and
 * the feed stayed empty while the request itself saved fine.
 *
 * Same shape as KnodeNotificationCategory: the constraint lists every heading
 * the product has; which of them a dashboard shows is decided in the client.
 */
export class KnodeDemoNotificationCategory1786503600000
  implements MigrationInterface
{
  name = 'KnodeDemoNotificationCategory1786503600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "vtx_notifications_category_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "notifications" ADD CONSTRAINT "vtx_notifications_category_check"
        CHECK ("category" IN ('contact','jobs','architect','insights','system',
                              'quotes','visits','knode','knodeDemo'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rows in the departing category would violate the narrower constraint.
    // They are announcements, not records — the request each one points at
    // is untouched, so dropping them loses nothing but the notice.
    await queryRunner.query(
      `DELETE FROM "notifications" WHERE "category" = 'knodeDemo'`,
    );

    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "vtx_notifications_category_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "notifications" ADD CONSTRAINT "vtx_notifications_category_check"
        CHECK ("category" IN ('contact','jobs','architect','insights','system',
                              'quotes','visits','knode'))
    `);
  }
}
