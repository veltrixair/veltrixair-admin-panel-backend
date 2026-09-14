import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A feed heading for the Knode product deck.
 *
 * The deck writes leads straight into the IT unit, and until now nothing
 * announced them. That is worse here than on any other desk: every other
 * record in this system arrives because somebody filled in a form on a website
 * and is waiting to be contacted, so an admin who misses the notification
 * still finds it on the list at the start of the next working day. A Knode
 * lead is a hospital director who agreed to a demo on a specific date — one
 * that can be days away, or tomorrow — and the cost of noticing it late is a
 * meeting nobody turned up to.
 *
 * Its own category rather than folding it under "contact". A contact enquiry
 * is somebody asking to be sold to; this is a record of what was agreed in a
 * room. They read differently and are chased by different people, and the
 * whole point of a chip is to separate the two.
 *
 * Category, not per-site: the constraint lists every heading the product has,
 * and which of them a given dashboard offers is a presentation question
 * answered in the client — see `filtersFor` there.
 */
export class KnodeNotificationCategory1786053600000
  implements MigrationInterface
{
  name = 'KnodeNotificationCategory1786053600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "vtx_notifications_category_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "notifications" ADD CONSTRAINT "vtx_notifications_category_check"
        CHECK ("category" IN ('contact','jobs','architect','insights','system',
                              'quotes','visits','knode'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rows in the departing category would violate the narrower constraint.
    // They are announcements, not records — the lead each one points at is
    // untouched, so dropping them loses nothing but the notice.
    await queryRunner.query(
      `DELETE FROM "notifications" WHERE "category" = 'knode'`,
    );

    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "vtx_notifications_category_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "notifications" ADD CONSTRAINT "vtx_notifications_category_check"
        CHECK ("category" IN ('contact','jobs','architect','insights','system',
                              'quotes','visits'))
    `);
  }
}
