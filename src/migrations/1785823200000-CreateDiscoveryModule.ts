import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Discovery sessions for /talk-to-architect/ — Phase 1.
 *
 * Sessions are 45 minutes ("10 / 25 / 10") and run Monday–Thursday,
 * 09:00–18:00 KSA. That window is the intersection of all three offices'
 * working weeks: Riyadh Sun–Thu, Dubai and Bangalore Mon–Fri.
 *
 * Architects are seeded WITHOUT personal names. The page states each practice
 * has a named senior architect, but the names are not published, so inventing
 * them would put fabricated identities on a live site. `full_name` is null and
 * the API reports `profilePending: true` until real people are recorded.
 *
 * No holiday calendar in this phase — firm-wide closures are expressed as
 * blackouts with a null architect_id.
 */
export class CreateDiscoveryModule1785823200000 implements MigrationInterface {
  name = 'CreateDiscoveryModule1785823200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "discovery_practice_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "practice_code" integer NOT NULL,
        "practice_name" character varying(100) NOT NULL,
        "slug"          character varying(100) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_discovery_practice_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_discovery_practice_masters_practice_code_unique" UNIQUE ("practice_code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "architects" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug"          character varying(120) NOT NULL,
        "full_name"     character varying(150),
        "display_title" character varying(150) NOT NULL,
        "credentials"   character varying(500),
        "practice_code" integer NOT NULL,
        "office_code"   integer NOT NULL,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_architects_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_architects_slug_unique" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "architect_availability_rules" (
        "id"             uuid NOT NULL DEFAULT gen_random_uuid(),
        "architect_id"   uuid NOT NULL,
        "weekday"        integer NOT NULL,
        "start_hour"     integer NOT NULL,
        "end_hour"       integer NOT NULL,
        "timezone"       character varying(64) NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to"   date,
        "is_active"      boolean NOT NULL DEFAULT true,
        "created_date"   timestamptz NOT NULL DEFAULT now(),
        "updated_date"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_architect_availability_rules_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_architect_availability_rules_weekday_check"
          CHECK ("weekday" BETWEEN 0 AND 6),
        CONSTRAINT "vtx_architect_availability_rules_hours_check"
          CHECK ("start_hour" >= 0 AND "end_hour" <= 24 AND "start_hour" < "end_hour")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "architect_blackouts" (
        "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
        "architect_id" uuid,
        "starts_at"    timestamptz NOT NULL,
        "ends_at"      timestamptz NOT NULL,
        "reason"       character varying(20) NOT NULL,
        "note"         character varying(300),
        "created_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_architect_blackouts_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_architect_blackouts_reason_check"
          CHECK ("reason" IN ('LEAVE','HOLIDAY','COMMITMENT')),
        CONSTRAINT "vtx_architect_blackouts_range_check" CHECK ("ends_at" > "starts_at")
      )
    `);

    // The unique constraint below is what makes double-booking impossible:
    // a slot is claimed with a conditional UPDATE, and no architect can hold
    // two sessions at the same instant even if generation runs twice.
    await queryRunner.query(`
      CREATE TABLE "session_slots" (
        "id"             uuid NOT NULL DEFAULT gen_random_uuid(),
        "architect_id"   uuid NOT NULL,
        "starts_at"      timestamptz NOT NULL,
        "ends_at"        timestamptz NOT NULL,
        "status"         character varying(10) NOT NULL DEFAULT 'FREE',
        "blocked_reason" character varying(20),
        "created_date"   timestamptz NOT NULL DEFAULT now(),
        "updated_date"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_session_slots_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_session_slots_architect_starts_at_unique" UNIQUE ("architect_id","starts_at"),
        CONSTRAINT "vtx_session_slots_status_check"
          CHECK ("status" IN ('FREE','BOOKED','BLOCKED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "discovery_bookings" (
        "id"                     uuid NOT NULL DEFAULT gen_random_uuid(),
        "reference_no"           character varying(30) NOT NULL,
        "slot_id"                uuid NOT NULL,
        "architect_id"           uuid NOT NULL,
        "full_name"              character varying(150) NOT NULL,
        "company"                character varying(150) NOT NULL,
        "role_title"             character varying(150) NOT NULL,
        "work_email"             character varying(255) NOT NULL,
        "programme"              character varying(2000) NOT NULL,
        "requires_nda"           boolean NOT NULL DEFAULT false,
        "attendee_timezone"      character varying(64) NOT NULL,
        "consent_at"             timestamptz NOT NULL,
        "privacy_notice_version" character varying(50) NOT NULL,
        "status"                 character varying(15) NOT NULL DEFAULT 'BOOKED',
        "deliverables_due_at"    timestamptz NOT NULL,
        "invite_sent_at"         timestamptz,
        "cancelled_at"           timestamptz,
        "manage_token"           character varying(64) NOT NULL,
        "source_page"            character varying(500),
        "ip_hash"                character varying(64),
        "user_agent"             character varying(500),
        "spam_score"             integer NOT NULL DEFAULT 0,
        "is_deleted"             boolean NOT NULL DEFAULT false,
        "deleted_at"             timestamptz,
        "created_date"           timestamptz NOT NULL DEFAULT now(),
        "updated_date"           timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_discovery_bookings_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_discovery_bookings_reference_no_unique" UNIQUE ("reference_no"),
        CONSTRAINT "vtx_discovery_bookings_slot_id_unique" UNIQUE ("slot_id"),
        CONSTRAINT "vtx_discovery_bookings_manage_token_unique" UNIQUE ("manage_token"),
        CONSTRAINT "vtx_discovery_bookings_status_check"
          CHECK ("status" IN ('BOOKED','COMPLETED','CANCELLED','NO_SHOW'))
      )
    `);

    // -- Foreign keys ----------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "architects" ADD CONSTRAINT "vtx_architects_practice_code_fk"
      FOREIGN KEY ("practice_code") REFERENCES "discovery_practice_masters"("practice_code") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "architects" ADD CONSTRAINT "vtx_architects_office_code_fk"
      FOREIGN KEY ("office_code") REFERENCES "office_masters"("office_code") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "architect_availability_rules" ADD CONSTRAINT "vtx_architect_availability_rules_architect_id_fk"
      FOREIGN KEY ("architect_id") REFERENCES "architects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "architect_blackouts" ADD CONSTRAINT "vtx_architect_blackouts_architect_id_fk"
      FOREIGN KEY ("architect_id") REFERENCES "architects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "session_slots" ADD CONSTRAINT "vtx_session_slots_architect_id_fk"
      FOREIGN KEY ("architect_id") REFERENCES "architects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings" ADD CONSTRAINT "vtx_discovery_bookings_slot_id_fk"
      FOREIGN KEY ("slot_id") REFERENCES "session_slots"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings" ADD CONSTRAINT "vtx_discovery_bookings_architect_id_fk"
      FOREIGN KEY ("architect_id") REFERENCES "architects"("id") ON DELETE RESTRICT
    `);

    // -- Indexes ---------------------------------------------------------
    await queryRunner.query(
      `CREATE INDEX "idx_architects_practice_code" ON "architects" ("practice_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_architect_availability_rules_architect_id" ON "architect_availability_rules" ("architect_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_architect_blackouts_architect_id" ON "architect_blackouts" ("architect_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_architect_blackouts_range" ON "architect_blackouts" ("starts_at","ends_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_session_slots_architect_id" ON "session_slots" ("architect_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_session_slots_starts_at" ON "session_slots" ("starts_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_session_slots_status" ON "session_slots" ("status")`,
    );
    // Drives every availability query: free slots for a practice in a window.
    await queryRunner.query(`
      CREATE INDEX "idx_session_slots_free_lookup"
        ON "session_slots" ("architect_id","starts_at")
        WHERE "status" = 'FREE'
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_discovery_bookings_architect_id" ON "discovery_bookings" ("architect_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_discovery_bookings_status" ON "discovery_bookings" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_discovery_bookings_work_email" ON "discovery_bookings" ("work_email")`,
    );

    await queryRunner.query(
      `CREATE SEQUENCE "discovery_booking_ref_seq" START WITH 1 INCREMENT BY 1`,
    );

    await this.seed(queryRunner);
  }

  private async seed(queryRunner: QueryRunner): Promise<void> {
    // The six options under "Pick a practice".
    await queryRunner.query(`
      INSERT INTO "discovery_practice_masters" ("practice_code","practice_name","slug","display_order")
      VALUES
        (101,'Custom Software','custom-software',1),
        (102,'Platform Engineering','platform-engineering',2),
        (103,'Cybersecurity & SOC','cybersecurity-soc',3),
        (104,'Data Privacy','data-privacy',4),
        (105,'Business Apps','business-apps',5),
        (106,'AI & Voice','ai-voice',6)
    `);

    // One architect per practice. Names are deliberately absent — see the note
    // at the top of this file. Offices assigned by where each practice sits.
    await queryRunner.query(`
      INSERT INTO "architects" ("slug","full_name","display_title","credentials","practice_code","office_code")
      VALUES
        ('custom-software-architect',      NULL,'Senior Architect — Custom Software',      NULL,101,101),
        ('platform-engineering-architect', NULL,'Senior Architect — Platform Engineering', NULL,102,101),
        ('cybersecurity-soc-architect',    NULL,'Senior Architect — Cybersecurity & SOC',  NULL,103,101),
        ('data-privacy-architect',         NULL,'Senior Architect — Data Privacy',         NULL,104,101),
        ('business-apps-architect',        NULL,'Senior Architect — Business Apps',        NULL,105,102),
        ('ai-voice-architect',             NULL,'Senior Architect — AI & Voice',           NULL,106,103)
    `);

    // Monday–Thursday, 09:00–18:00 Asia/Riyadh, for every architect.
    // Weekday numbers are JS convention: 1 Mon … 4 Thu.
    await queryRunner.query(`
      INSERT INTO "architect_availability_rules"
        ("architect_id","weekday","start_hour","end_hour","timezone","effective_from")
      SELECT a.id, w.weekday, 9, 18, 'Asia/Riyadh', DATE '2026-01-01'
      FROM "architects" a
      CROSS JOIN (VALUES (1),(2),(3),(4)) AS w(weekday)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP SEQUENCE IF EXISTS "discovery_booking_ref_seq"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "discovery_bookings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "session_slots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "architect_blackouts"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "architect_availability_rules"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "architects"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "discovery_practice_masters"`,
    );
  }
}
