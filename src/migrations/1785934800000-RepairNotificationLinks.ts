import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Point existing notifications at pages that exist.
 *
 * The first cut built each link from the record's reference number and, for
 * the crane and privacy sources, from a path invented rather than looked up.
 * Both were wrong. Every detail screen fetches by uuid — the admin routes put
 * ParseUUIDPipe on the param — so a reference number reached the right screen
 * and then failed the lookup with a 400; and the wrong paths fell through the
 * router to the public landing page.
 *
 * Repairable because `source_id` already holds the uuid: the rows have always
 * known where they point, the link was just written from the wrong column.
 * Rebuilt here rather than dropped, so nothing anyone has already been told
 * quietly disappears.
 *
 * `crane_application` is left alone deliberately. There is no crane candidates
 * screen yet, so there is no correct link to write — it stays broken until the
 * Careers module is built, which is a decision rather than an oversight.
 */
export class RepairNotificationLinks1785934800000 implements MigrationInterface {
  name = 'RepairNotificationLinks1785934800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const routes: Record<string, string> = {
      contact_enquiry: '/contact/',
      job_application: '/candidates/',
      discovery_booking: '/architect/',
      crane_quote: '/crane/quotes/',
      crane_site_visit: '/crane/site-visits/',
      privacy_enquiry: '/dp/contact/',
    };

    for (const [sourceType, prefix] of Object.entries(routes)) {
      await queryRunner.query(
        `UPDATE "notifications"
            SET "link" = $1 || "source_id"::text
          WHERE "source_type" = $2
            AND "source_id" IS NOT NULL
            AND "link" <> $1 || "source_id"::text`,
        [prefix, sourceType],
      );
    }
  }

  public async down(): Promise<void> {
    /*
     * Deliberately empty. The previous links pointed at pages that do not
     * exist or ids the API rejects — restoring them would be reintroducing the
     * fault, and a notification's link carries no information that is lost by
     * leaving it correct.
     */
  }
}
