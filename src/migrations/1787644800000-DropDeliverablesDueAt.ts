import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the deliverables due date from discovery bookings.
 *
 * It was computed at assignment, two business days after the session on the
 * architect's office calendar, and shown on the session page. Nothing acted on
 * it: no reminder fired, no list filtered by it, no status changed when it
 * passed. A date that only ever gets read is a date that goes stale without
 * anybody noticing, so it goes rather than being carried.
 *
 * The attendee email still promises deliverables within two business days.
 * That promise is copy, not a tracked commitment, and it is unaffected here.
 */
export class DropDeliverablesDueAt1787644800000 implements MigrationInterface {
  name = 'DropDeliverablesDueAt1787644800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings"
        DROP COLUMN IF EXISTS "deliverables_due_at"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Nullable on the way back, not NOT NULL as the table was first created.
     * The dates themselves are gone, and the column was already made nullable
     * when bookings stopped carrying an architect at the moment of booking.
     */
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings"
        ADD COLUMN IF NOT EXISTS "deliverables_due_at" timestamptz
    `);
  }
}
