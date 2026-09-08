import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The one stream every site event lands in.
 *
 * Two tables rather than one, and the split is the whole design.
 *
 * `notifications` holds one row per thing that happened — not one per person
 * who should hear about it. Fanning out at write time is the usual approach
 * and it is wrong here: it freezes the audience at the moment of creation, so
 * an HR manager appointed on Tuesday would never see Monday's arrivals, and
 * somebody whose role was revoked would keep seeing what they may no longer
 * open. Audience is answered at read time from the reader's current role, so
 * it is always the truth rather than a snapshot of it.
 *
 * That makes visibility two columns: `site_code` says which dashboard the
 * event belongs to, and `feature_code` says which feature a reader must be
 * able to VIEW. A row is visible when both agree with the reader's session —
 * the same pair the permissions guard already checks before letting anyone
 * open the underlying record. A notification names a customer and quotes their
 * enquiry, so it has to be governed exactly as tightly as the record it points
 * at, not more loosely.
 *
 * `notification_reads` is the per-person half. Absent means unread, which
 * keeps the common case free of rows: nobody writes anything until somebody
 * actually reads something.
 */
export class Notifications1785927600000 implements MigrationInterface {
  name = 'Notifications1785927600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4()
          CONSTRAINT "vtx_notifications_id_pk" PRIMARY KEY,

        "site_code" int NOT NULL,
        "feature_code" int NOT NULL,

        -- Which filter chip it sits under. Deliberately not derived from
        -- feature_code: several features share one heading on the screen
        -- (IT and Privacy enquiries are both "Contact us"), and the grouping
        -- is a presentation decision that should be free to change without a
        -- migration.
        "category" varchar(20) NOT NULL,

        -- Split so the row can be rendered without innerHTML: the lead is
        -- shown bold, the body follows it.
        "lead" varchar(150) NOT NULL,
        "body" varchar(400) NOT NULL,

        -- Where clicking it goes. A path, never a full URL — the same bundle
        -- serves three brands on three hostnames.
        "link" varchar(300) NOT NULL,

        -- What it is about, for de-duplication and for cleaning up after a
        -- record is deleted. No foreign key: the target lives in one of half a
        -- dozen tables and a polymorphic FK cannot be expressed.
        "source_type" varchar(40) NOT NULL,
        "source_id" uuid NULL,

        "created_date" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "vtx_notifications_category_check"
          CHECK ("category" IN ('contact','jobs','architect','insights','system'))
      )
    `);

    /*
     * The list query in one index: everything visible to a reader on one
     * dashboard, newest first. site_code leads because it is the equality
     * that eliminates the most rows, and created_date is stored descending so
     * the ordering is a scan rather than a sort.
     */
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_feed" ON "notifications" ` +
        `("site_code", "feature_code", "created_date" DESC)`,
    );

    // For tidying up after a record is removed.
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_source" ON "notifications" ` +
        `("source_type", "source_id") WHERE "source_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "notification_reads" (
        "notification_id" uuid NOT NULL,
        "admin_id" uuid NOT NULL,
        "read_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "vtx_notification_reads_pk"
          PRIMARY KEY ("notification_id", "admin_id"),

        -- Cascade on both sides: a read receipt has no meaning once either
        -- the notification or the reader is gone.
        CONSTRAINT "vtx_notification_reads_notification_fk"
          FOREIGN KEY ("notification_id") REFERENCES "notifications"("id")
          ON DELETE CASCADE,
        CONSTRAINT "vtx_notification_reads_admin_fk"
          FOREIGN KEY ("admin_id") REFERENCES "admins"("id")
          ON DELETE CASCADE
      )
    `);

    // "What have I read?" is asked once per feed load, by admin.
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_reads_admin" ON "notification_reads" ("admin_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_reads"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
