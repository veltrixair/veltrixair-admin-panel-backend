import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records who opened a candidate's certificates, distinctly from their CV.
 *
 * The companion to CV_ACCESSED, and a separate type rather than the same one
 * with a flag in `metadata`: the timeline is read by people, and "CV opened"
 * against a rigging ticket would be a false line in an audit trail of exactly
 * the records that need one.
 *
 * Certificates are the crane board's own attachment — up to four tickets and
 * cards per application, which is what a recruiter here is actually checking.
 */
export class CraneCertificateAccessEvent1785956400000
  implements MigrationInterface
{
  name = 'CraneCertificateAccessEvent1785956400000';

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
           'CERTIFICATE_ACCESSED','ASSIGNED','UNASSIGNED','NOTE_ADDED',
           'WITHDRAWN','NOTIFICATION_SENT'
         ))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "crane_application_events"
        WHERE "event_type" = 'CERTIFICATE_ACCESSED'`,
    );
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
}
