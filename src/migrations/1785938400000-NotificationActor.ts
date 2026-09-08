import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Who caused a notification, so they are not told about it.
 *
 * The feed began with events arriving from outside — an enquiry, an
 * application, a booking — where nobody inside the company caused the thing
 * being announced. System events are the opposite: an administrator grants
 * access, changes a role, deactivates an account. Announcing those back to the
 * person who just did them is noise, and it is the kind that teaches people to
 * stop reading the bell.
 *
 * A column rather than a filter at write time, because this model answers
 * "who may see this" when it is read. Excluding the actor is the same kind of
 * question as excluding the wrong dashboard, and belongs in the same place.
 *
 * Nullable, and null means "nobody in particular caused this" — every event
 * raised so far, and everything arriving from the public site. Those stay
 * visible to everyone entitled to them.
 *
 * ON DELETE SET NULL: an administrator leaving should not delete the record of
 * what they did, nor hide it from the people who could already see it.
 */
export class NotificationActor1785938400000 implements MigrationInterface {
  name = 'NotificationActor1785938400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN "actor_admin_id" uuid NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_actor" ` +
        `FOREIGN KEY ("actor_admin_id") REFERENCES "admins"("id") ` +
        `ON DELETE SET NULL`,
    );

    /*
     * Partial, and deliberately not part of the feed index.
     *
     * The feed's filter on this column is an inequality against one id, which
     * an index cannot serve — it is applied after the rows are found. This one
     * exists for the other direction: "what did this person do", which is a
     * question an audit will eventually ask.
     */
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_actor" ON "notifications" ("actor_admin_id") ` +
        `WHERE "actor_admin_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_actor"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "FK_notifications_actor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "actor_admin_id"`,
    );
  }
}
