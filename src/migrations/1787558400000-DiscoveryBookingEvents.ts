import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives a discovery booking a timeline.
 *
 * It had none, and the change that made bookings slotless is what made the
 * absence matter. A session used to be settled the moment it was taken — the
 * visitor picked the architect and the hour, and the only thing left to record
 * was whether the call happened. Now it passes through three hands: somebody
 * asks for an hour, somebody here decides who takes it, and only afterwards is
 * there an outcome. The booking row keeps the latest answer to each and no
 * memory of the others, so "who had this before it was moved" and "when did we
 * agree to that" were questions nothing could answer.
 *
 * Backfilled with one CREATED row per existing booking, timed from
 * `created_date`. Not an invention: those bookings genuinely were created, and
 * a timeline that starts blank reads as though the record began the day this
 * shipped. Nothing else is reconstructed — the assignments and status changes
 * that happened before today were not recorded, and guessing at them would put
 * fiction in an audit trail.
 */
export class DiscoveryBookingEvents1787558400000 implements MigrationInterface {
  name = 'DiscoveryBookingEvents1787558400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "discovery_booking_events" (
        "id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_id"   uuid NOT NULL,
        "event_type"   varchar(30) NOT NULL,
        "actor"        varchar(150),
        "note"         varchar(2000),
        "metadata"     jsonb,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_discovery_booking_events_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_discovery_booking_events_booking_id_fk"
          FOREIGN KEY ("booking_id") REFERENCES "discovery_bookings"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_discovery_booking_events_event_type_check"
          CHECK ("event_type" IN (
            'CREATED','ASSIGNED','STATUS_CHANGED','NOTE_ADDED','CANCELLED_BY_ATTENDEE'
          ))
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_discovery_booking_events_booking_id"
         ON "discovery_booking_events" ("booking_id")`,
    );

    await queryRunner.query(`
      INSERT INTO "discovery_booking_events"
        ("booking_id", "event_type", "actor", "note", "created_date")
      SELECT
        "id",
        'CREATED',
        NULL,
        'Requested from the website.',
        "created_date"
      FROM "discovery_bookings"
      WHERE "is_deleted" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_discovery_booking_events_booking_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "discovery_booking_events"`);
  }
}
