import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The one source type RepairNotificationLinks left alone.
 *
 * It was skipped deliberately: crane applications had no candidates screen, so
 * there was no correct link to write, and the rows kept pointing at
 * `/crane-candidates/<reference>` — a path never mounted, carrying a reference
 * number where every detail screen wants a uuid. Two faults in one link.
 *
 * The screen exists now, at `/crane/candidates/:applicationId`, so the rows
 * can be finished. Rebuilt from `source_id`, which has held the uuid all
 * along; the link was only ever written from the wrong column.
 *
 * New notifications have been correct since the service was fixed — this is
 * for the ones written before that.
 */
export class RepairCraneApplicationLinks1785960000000
  implements MigrationInterface
{
  name = 'RepairCraneApplicationLinks1785960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "notifications"
          SET "link" = '/crane/candidates/' || "source_id"::text
        WHERE "source_type" = 'crane_application'
          AND "source_id" IS NOT NULL
          AND "link" <> '/crane/candidates/' || "source_id"::text`,
    );
  }

  /*
   * Not reversible in any useful sense. The old links were broken and the
   * reference number they carried is not recoverable from this table, so
   * putting them back would mean inventing data. Left as a no-op rather than
   * pretending otherwise.
   */
  public async down(): Promise<void> {
    return Promise.resolve();
  }
}
