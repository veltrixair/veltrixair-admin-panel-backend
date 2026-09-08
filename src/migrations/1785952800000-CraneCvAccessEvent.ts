import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records who opened a crane candidate's CV.
 *
 * The IT board has done this since it shipped: reading somebody's résumé goes
 * on the application's own timeline, because it is an access to personal data
 * rather than a page view. The crane board never did, and its records are the
 * heavier of the two — they carry nationality and KSA residency status, which
 * is the whole reason applications sit behind their own feature code.
 *
 * A CHECK rather than an enum type, matching how the table was built.
 */
export class CraneCvAccessEvent1785952800000 implements MigrationInterface {
  name = 'CraneCvAccessEvent1785952800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "crane_application_events"
         DROP CONSTRAINT IF EXISTS "vtx_crane_application_events_event_type_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crane_application_events"
         ADD CONSTRAINT "vtx_crane_application_events_event_type_check"
         CHECK ("event_type" IN (
           'CREATED','ACKNOWLEDGED','STAGE_CHANGED','CV_ATTACHED','CV_ACCESSED',
           'ASSIGNED','UNASSIGNED','NOTE_ADDED','WITHDRAWN','NOTIFICATION_SENT'
         ))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Rows written under the new type would fail the old CHECK, so they go
     * first. Deleting them loses an audit trail, which is why this direction
     * exists only to unwind a bad deploy.
     */
    await queryRunner.query(
      `DELETE FROM "crane_application_events" WHERE "event_type" = 'CV_ACCESSED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "crane_application_events"
         DROP CONSTRAINT IF EXISTS "vtx_crane_application_events_event_type_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crane_application_events"
         ADD CONSTRAINT "vtx_crane_application_events_event_type_check"
         CHECK ("event_type" IN (
           'CREATED','ACKNOWLEDGED','STAGE_CHANGED','CV_ATTACHED',
           'ASSIGNED','UNASSIGNED','NOTE_ADDED','WITHDRAWN','NOTIFICATION_SENT'
         ))`,
    );
  }
}
