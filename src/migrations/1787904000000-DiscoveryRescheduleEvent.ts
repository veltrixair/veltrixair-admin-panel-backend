import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets the booking timeline record a reschedule.
 *
 * The admin panel can now move a session to another hour, and that is a third
 * kind of change to a booking — not an assignment, not an outcome. Widening
 * the CHECK is the half of the feature that lives in the database: the
 * TypeScript union alone would pass review and then fail at the INSERT, which
 * is exactly how this one was found.
 */
export class DiscoveryRescheduleEvent1787904000000 implements MigrationInterface {
  name = 'DiscoveryRescheduleEvent1787904000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "discovery_booking_events"
         DROP CONSTRAINT IF EXISTS "vtx_discovery_booking_events_event_type_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "discovery_booking_events"
         ADD CONSTRAINT "vtx_discovery_booking_events_event_type_check"
         CHECK ("event_type" IN (
           'CREATED','ASSIGNED','RESCHEDULED','STATUS_CHANGED','NOTE_ADDED',
           'CANCELLED_BY_ATTENDEE'
         ))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Rows written under the new type would fail the old CHECK, so they go
     * first.
     *
     * This loses the only record of which sessions were moved, and the
     * bookings keep their new times with nothing to say they were ever
     * changed. That is a real cost, and the reason this direction exists only
     * to unwind a bad deploy rather than as a routine step.
     */
    await queryRunner.query(
      `DELETE FROM "discovery_booking_events" WHERE "event_type" = 'RESCHEDULED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "discovery_booking_events"
         DROP CONSTRAINT IF EXISTS "vtx_discovery_booking_events_event_type_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "discovery_booking_events"
         ADD CONSTRAINT "vtx_discovery_booking_events_event_type_check"
         CHECK ("event_type" IN (
           'CREATED','ASSIGNED','STATUS_CHANGED','NOTE_ADDED',
           'CANCELLED_BY_ATTENDEE'
         ))`,
    );
  }
}
