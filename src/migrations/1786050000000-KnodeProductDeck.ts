import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Knode product deck — lead capture.
 *
 * The first module whose records do not come from a website. The Knode HMS
 * deck is a sales tool carried into hospital meeting rooms: a rep types a
 * lead while sitting with the director, often on poor connectivity, and it
 * may reach us minutes or days later. Two things in this schema exist only
 * because of that:
 *
 *   `client_key` is unique and supplied by the deck. It is the only thing
 *   standing between a replayed offline queue and a table full of duplicates.
 *
 *   `saved_at` is separate from `created_date`. Everywhere else those are the
 *   same instant; here the first is when the conversation happened and the
 *   second is when the network finally allowed it through.
 *
 * One table with a `lead_type` discriminator rather than two, because the two
 * records differ by a meeting date and a status vocabulary — not by being
 * different things. The status vocabularies really are disjoint though, so a
 * CHECK enforces that a booked demo cannot be marked LIVE.
 */
export class KnodeProductDeck1786050000000 implements MigrationInterface {
  name = 'KnodeProductDeck1786050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- leads -------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "knode_leads" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "site_code"       int  NOT NULL,
        "reference_no"    varchar(30)  NOT NULL,
        "client_key"      varchar(100) NOT NULL,
        "lead_type"       varchar(20)  NOT NULL,
        "hospital_name"   varchar(200) NOT NULL,
        "contact_person"  varchar(150) NOT NULL,
        "designation"     varchar(150),
        "whatsapp"        varchar(32)  NOT NULL,
        "email"           varchar(255),
        "meeting_date"    date,
        "meeting_time"    varchar(5),
        "notes"           varchar(2000),
        "status"          varchar(25)  NOT NULL DEFAULT 'NEW',
        "assigned_to"     varchar(150),
        "saved_at"        timestamptz  NOT NULL,
        "synced_at"       timestamptz,
        "ip_hash"         varchar(64),
        "user_agent"      varchar(500),
        "is_deleted"      boolean NOT NULL DEFAULT false,
        "deleted_at"      timestamptz,
        "created_date"    timestamptz NOT NULL DEFAULT now(),
        "updated_date"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_knode_leads_id_pk"                PRIMARY KEY ("id"),
        CONSTRAINT "vtx_knode_leads_reference_no_unique"  UNIQUE ("reference_no"),
        CONSTRAINT "vtx_knode_leads_client_key_unique"    UNIQUE ("client_key"),
        CONSTRAINT "vtx_knode_leads_site_code_fk"
          FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_knode_leads_lead_type_check"
          CHECK ("lead_type" IN ('MEETING_SCHEDULED','CLIENT_CONFIRMED')),
        /*
         * The two journeys share only NEW. Without this a demo could be
         * marked LIVE, which reads on a report as a closed sale that never
         * happened.
         */
        CONSTRAINT "vtx_knode_leads_status_check" CHECK (
          ("lead_type" = 'MEETING_SCHEDULED' AND "status" IN
            ('NEW','REMINDER_SENT','DEMO_DONE','RESCHEDULED','DONE','CANCELLED'))
          OR
          ("lead_type" = 'CLIENT_CONFIRMED' AND "status" IN
            ('NEW','ONBOARDING_STARTED','PAPERWORK_DONE','GO_LIVE_PLANNED','LIVE','DROPPED'))
        ),
        /*
         * A meeting nobody can attend is not a meeting; a confirmed client has
         * no meeting to hold. Both halves are enforced so neither shape can be
         * written by a client that skips the service.
         */
        CONSTRAINT "vtx_knode_leads_meeting_when_check" CHECK (
          ("lead_type" = 'MEETING_SCHEDULED'
             AND "meeting_date" IS NOT NULL AND "meeting_time" IS NOT NULL)
          OR
          ("lead_type" = 'CLIENT_CONFIRMED'
             AND "meeting_date" IS NULL AND "meeting_time" IS NULL)
        )
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_knode_leads_lead_type" ON "knode_leads" ("lead_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_knode_leads_status" ON "knode_leads" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_knode_leads_hospital_name" ON "knode_leads" ("hospital_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_knode_leads_saved_at" ON "knode_leads" ("saved_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_knode_leads_created_date" ON "knode_leads" ("created_date")`,
    );

    /*
     * Partial index for the "Upcoming this week" tile and its filter, which is
     * the only query that runs on every page load. Meetings only — a confirmed
     * client has no date to sort by.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_knode_leads_upcoming"
        ON "knode_leads" ("meeting_date")
        WHERE "lead_type" = 'MEETING_SCHEDULED' AND "is_deleted" = false
    `);

    // --- events ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "knode_lead_events" (
        "id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
        "lead_id"      uuid NOT NULL,
        "event_type"   varchar(30) NOT NULL,
        "actor"        varchar(150),
        "note"         varchar(2000),
        "metadata"     jsonb,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_knode_lead_events_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_knode_lead_events_lead_id_fk"
          FOREIGN KEY ("lead_id") REFERENCES "knode_leads"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_knode_lead_events_event_type_check"
          CHECK ("event_type" IN ('CREATED','STATUS_CHANGED','ASSIGNED','NOTE_ADDED'))
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_knode_lead_events_lead_id" ON "knode_lead_events" ("lead_id")`,
    );

    // --- reference sequences -----------------------------------------------
    //
    // Two, not one: the deck's own mockup numbers meetings and confirmations
    // independently (KND-MTG-2026-0007 beside KND-CNF-2026-0004), and the
    // reference a rep reads out is the reference they were shown.
    await queryRunner.query(
      `CREATE SEQUENCE "knode_meeting_ref_seq" START WITH 1`,
    );
    await queryRunner.query(
      `CREATE SEQUENCE "knode_client_ref_seq" START WITH 1`,
    );

    // --- feature and grants -------------------------------------------------
    await queryRunner.query(`
      INSERT INTO "feature_masters" ("feature_code","feature_name","description")
      VALUES (114,'KNODE','Leads captured from the Knode HMS product deck.')
      ON CONFLICT ("feature_code") DO NOTHING
    `);

    // Super Admin's grants were seeded by a CROSS JOIN when the auth module was
    // created, so a feature added later inherits nothing and must be named.
    // Sales gets it because this is their pipeline; nobody else does.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code","feature_code","permission_code")
      SELECT r.code, 114, p.code
      FROM (VALUES (101),(104)) AS r(code)
      CROSS JOIN (VALUES (101),(102),(103),(104)) AS p(code)
      ON CONFLICT ("role_code","feature_code","permission_code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "feature_code" = 114`,
    );
    await queryRunner.query(
      `DELETE FROM "feature_masters" WHERE "feature_code" = 114`,
    );
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "knode_client_ref_seq"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "knode_meeting_ref_seq"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knode_lead_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knode_leads"`);
  }
}
