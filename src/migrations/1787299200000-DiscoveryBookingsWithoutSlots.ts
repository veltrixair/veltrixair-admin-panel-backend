import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A discovery booking is now a request for a time, not a claim on an
 * architect's slot.
 *
 * The website asks for a date and an hour; who takes the session is decided
 * afterwards, in the admin panel, along with the practice. So the two things
 * that used to be chosen in the browser — the slot and therefore the architect
 * — arrive empty and are filled in later.
 *
 * That leaves the booking with nowhere to record WHEN it is for, because the
 * time used to be read off the slot. `requested_start_at` is that missing
 * field, and it is the only one the public form now has to supply.
 *
 * Everything about architects stays: session_slots, availability rules and
 * blackouts are untouched. They simply stop being part of the public path, and
 * remain what an admin consults when deciding who to assign.
 *
 * ONE BOOKING PER TIME is enforced by the partial unique index below rather
 * than by a check in the service. Two people confirming the same hour at the
 * same moment both pass any read-then-write test; only a constraint settles
 * it. Cancelled and deleted rows are excluded so an hour frees up again.
 */
export class DiscoveryBookingsWithoutSlots1787299200000
  implements MigrationInterface
{
  name = 'DiscoveryBookingsWithoutSlots1787299200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings" ADD COLUMN "requested_start_at" timestamptz
    `);

    // Existing bookings already have a time — it lives on their slot. This is
    // the last moment it can be copied across.
    await queryRunner.query(`
      UPDATE "discovery_bookings" b
         SET "requested_start_at" = s."starts_at"
        FROM "session_slots" s
       WHERE s."id" = b."slot_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "discovery_bookings"
        ALTER COLUMN "requested_start_at" SET NOT NULL
    `);

    // Assigned later, so no longer required at insert.
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings"
        ALTER COLUMN "slot_id" DROP NOT NULL,
        ALTER COLUMN "architect_id" DROP NOT NULL,
        ALTER COLUMN "deliverables_due_at" DROP NOT NULL
    `);

    /*
     * REQUESTED is the state a booking arrives in: a time is held, nobody is
     * assigned to it yet. BOOKED keeps its old meaning — an architect has it
     * and the invite has gone out — so the two are not the same thing and the
     * desk can tell at a glance which bookings still need a decision.
     */
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings"
        DROP CONSTRAINT IF EXISTS "vtx_discovery_bookings_status_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings"
        ADD CONSTRAINT "vtx_discovery_bookings_status_check"
        CHECK ("status" IN ('REQUESTED','BOOKED','COMPLETED','CANCELLED','NO_SHOW'))
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "vtx_discovery_bookings_one_per_time"
        ON "discovery_bookings" ("site_code", "requested_start_at")
        WHERE "status" <> 'CANCELLED' AND "is_deleted" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "vtx_discovery_bookings_one_per_time"`,
    );

    /*
     * Going back needs every booking to have a slot and an architect again,
     * and a request that was never assigned has neither. Those rows are
     * refused rather than guessed at: inventing an architect would put a
     * session in somebody's calendar that they never agreed to.
     */
    const unassigned: { count: string }[] = (await queryRunner.query(`
      SELECT count(*)::text AS count FROM "discovery_bookings"
       WHERE "slot_id" IS NULL OR "architect_id" IS NULL
    `)) as { count: string }[];

    if (Number(unassigned[0].count) > 0) {
      throw new Error(
        `${unassigned[0].count} booking(s) have no architect assigned. ` +
          'Assign or cancel them before rolling this back.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE "discovery_bookings"
        DROP CONSTRAINT IF EXISTS "vtx_discovery_bookings_status_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings"
        ADD CONSTRAINT "vtx_discovery_bookings_status_check"
        CHECK ("status" IN ('BOOKED','COMPLETED','CANCELLED','NO_SHOW'))
    `);
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings"
        ALTER COLUMN "slot_id" SET NOT NULL,
        ALTER COLUMN "architect_id" SET NOT NULL,
        ALTER COLUMN "deliverables_due_at" SET NOT NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "discovery_bookings" DROP COLUMN "requested_start_at"`,
    );
  }
}
