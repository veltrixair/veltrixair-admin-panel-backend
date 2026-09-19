import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The visitor's choice on the Book a demo form is now final.
 *
 * Until this migration the server could override it: a request for a live demo
 * of modules where none had shipped was rewritten into a waiting-list entry.
 * The reasoning was that nobody can be shown software that does not exist —
 * but the effect was that the person most worth a conversation, somebody
 * asking to see something still being built, was filed into the list nobody
 * works.
 *
 * From here the two lists are decided by the radio alone. "Live demo" is a
 * demo request whether the modules are live or pending; "Notify me" is a
 * notify request on the same terms. `requested_intent` and `intent` therefore
 * always agree, and the constraint swapped in below says so rather than
 * leaving it as a convention the next change could quietly break.
 *
 * What does NOT change: a notify row is still not a ladder. It carries no
 * status and its whole lifecycle is `notified_at`. Only the routing moves.
 */
export class KnodeDemoIntentIsFinal1786507200000 implements MigrationInterface {
  name = 'KnodeDemoIntentIsFinal1786507200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * Rows already downgraded belong in the demo pipeline under the new rule,
     * and they are also the rows the new constraint would reject. Both reasons
     * point the same way, so move them rather than grandfather them.
     *
     * The old constraint forbade the opposite direction, so every differing
     * row is requested DEMO / stored NOTIFY. That makes NEW the correct stage
     * for all of them: they were never worked, because they were never in a
     * list anyone was working.
     */

    // A downgraded row that was already told its module shipped is the one
    // case where the move destroys a fact. Write it to the timeline first —
    // the column cannot survive, since the lifecycle check forbids a demo row
    // from carrying notified_at.
    await queryRunner.query(`
      INSERT INTO "knode_demo_request_events"
        ("request_id", "event_type", "actor", "note", "metadata")
      SELECT
        "id",
        'STATUS_CHANGED',
        NULL,
        'Moved to the demo pipeline: the visitor asked for a live demo and the '
          || 'server had downgraded it. Already notified on '
          || to_char("notified_at", 'YYYY-MM-DD') || '.',
        jsonb_build_object(
          'from', NULL,
          'to', 'NEW',
          'migration', 'KnodeDemoIntentIsFinal',
          'previousIntent', "intent",
          'previousNotifiedAt', "notified_at"
        )
      FROM "knode_demo_requests"
      WHERE "requested_intent" <> "intent"
        AND "notified_at" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "knode_demo_requests"
         SET "intent"      = "requested_intent",
             "status"      = 'NEW',
             "notified_at" = NULL
       WHERE "requested_intent" <> "intent"
    `);

    // Was: NOT (requested_intent = 'NOTIFY' AND intent = 'DEMO') — it stopped
    // the server promoting somebody who had asked to be left alone, but still
    // permitted the downgrade in the other direction. Equality covers both.
    await queryRunner.query(`
      ALTER TABLE "knode_demo_requests"
        DROP CONSTRAINT IF EXISTS "vtx_knode_demo_requests_intent_resolution_check"
    `);

    await queryRunner.query(`
      ALTER TABLE "knode_demo_requests"
        ADD CONSTRAINT "vtx_knode_demo_requests_intent_final_check"
        CHECK ("intent" = "requested_intent")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knode_demo_requests"
        DROP CONSTRAINT IF EXISTS "vtx_knode_demo_requests_intent_final_check"
    `);

    await queryRunner.query(`
      ALTER TABLE "knode_demo_requests"
        ADD CONSTRAINT "vtx_knode_demo_requests_intent_resolution_check"
        CHECK (NOT ("requested_intent" = 'NOTIFY' AND "intent" = 'DEMO'))
    `);

    /*
     * The backfill is deliberately not reversed.
     *
     * Once a downgraded row has been set to intent = requested_intent it is
     * indistinguishable from a request that was always a demo, so there is
     * nothing to reverse it by. Restoring the looser constraint lets the old
     * code run again; the rows it already corrected stay corrected.
     */
  }
}
