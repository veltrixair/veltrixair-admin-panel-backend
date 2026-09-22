import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Book a demo" on knode.veltrixair.com.
 *
 * THE SHAPE, AND WHY
 *
 * The website shows one form, but it collects two different things. Somebody
 * asking about kNODE HMS wants to see software that exists — that is a
 * pipeline: contact, schedule, show, win or lose. Somebody asking about
 * Pharmacy, which has not shipped, can only be told when it does. That is a
 * waiting list, and a waiting list has exactly one fact about it.
 *
 * So the two share a table and share nothing else:
 *
 *   DEMO    `status` walks a ladder. `notified_at` stays null.
 *   NOTIFY  `notified_at` is null while they wait, stamped when told.
 *           `status` stays null, because there are no stages to be in.
 *
 * A CHECK enforces that, so neither shape can be written by a client that
 * skips the service — and in particular a waiting-list entry can never acquire
 * a pipeline stage that would make it look like work in progress.
 *
 * The six option lists are seeded from the values the website already ships in
 * its own bundle. They are moved here so there is one copy: the crane form's
 * dropdowns drifted from its database exactly because there were two.
 */
export class KnodeBookDemo1786500000000 implements MigrationInterface {
  name = 'KnodeBookDemo1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- option lists ------------------------------------------------------
    //
    // Five near-identical label tables rather than one with a discriminator,
    // following the pattern the rest of the codebase already uses: each list
    // grows on its own schedule, and a shared table makes every read a filter.

    const labelTable = async (table: string, field: string) => {
      await queryRunner.query(`
        CREATE TABLE "${table}" (
          "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
          "site_code"     int  NOT NULL,
          "${field}_code"  int  NOT NULL,
          "${field}_label" varchar(120) NOT NULL,
          "display_order" int  NOT NULL DEFAULT 0,
          "is_active"     boolean NOT NULL DEFAULT true,
          "is_deleted"    boolean NOT NULL DEFAULT false,
          "deleted_at"    timestamptz,
          "created_date"  timestamptz NOT NULL DEFAULT now(),
          "updated_date"  timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT "vtx_${table}_id_pk" PRIMARY KEY ("id"),
          CONSTRAINT "vtx_${table}_${field}_code_unique" UNIQUE ("${field}_code"),
          CONSTRAINT "vtx_${table}_site_code_fk"
            FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT
        )
      `);
    };

    await labelTable('knode_facility_type_masters', 'facility_type');
    await labelTable('knode_bed_band_masters', 'bed_band');
    await labelTable('knode_opd_band_masters', 'opd_band');
    await labelTable('knode_contact_role_masters', 'contact_role');
    await labelTable('knode_call_window_masters', 'call_window');

    /*
     * Modules carry more than a label: `is_live` is what decides whether a
     * submission is a demo request or a place on a waiting list, so it is the
     * one piece of master data this module actually reasons about.
     */
    await queryRunner.query(`
      CREATE TABLE "knode_module_masters" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "site_code"     int  NOT NULL,
        "module_code"   int  NOT NULL,
        "module_name"   varchar(120) NOT NULL,
        "audience"      varchar(200) NOT NULL,
        "availability"  varchar(60)  NOT NULL,
        "is_live"       boolean NOT NULL DEFAULT false,
        "display_order" int  NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_knode_module_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_knode_module_masters_module_code_unique" UNIQUE ("module_code"),
        CONSTRAINT "vtx_knode_module_masters_site_code_fk"
          FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT
      )
    `);

    // --- seed, from the website's own lists ---------------------------------
    await queryRunner.query(`
      INSERT INTO "knode_module_masters"
        ("site_code","module_code","module_name","audience","availability","is_live","display_order") VALUES
        (101,101,'kNODE HMS','Registration, billing, IPD, reports','Live now',true,1),
        (101,102,'kNODE Clinical HMS','Doctor notes, orders, results','1 month',false,2),
        (101,103,'kNODE HRMS','Rosters, payroll, leave','1 month',false,3),
        (101,104,'kNODE Pharmacy','Batch, expiry, GST billing','2 months',false,4),
        (101,105,'kNODE LIS & RIS','Labs and imaging on one platform','2 months',false,5),
        (101,106,'kNODE RIS · PACS','Radiology · worklists, DICOM viewer','2 months',false,6)
    `);

    await queryRunner.query(`
      INSERT INTO "knode_facility_type_masters"
        ("site_code","facility_type_code","facility_type_label","display_order") VALUES
        (101,101,'Hospital',1),
        (101,102,'Nursing home',2),
        (101,103,'Polyclinic',3),
        (101,104,'Clinic',4),
        (101,105,'Diagnostic lab',5),
        (101,106,'Pharmacy',6),
        -- Last, and singular to match the "Other" already at the end of the
        -- roles list on the same form. A facility that fits none of the six
        -- above is still a lead; without this the visitor's only options are
        -- to pick something untrue or to close the tab.
        (101,107,'Other',7)
    `);

    await queryRunner.query(`
      INSERT INTO "knode_bed_band_masters"
        ("site_code","bed_band_code","bed_band_label","display_order") VALUES
        (101,101,'No inpatient beds',1),
        (101,102,'Under 30 beds',2),
        (101,103,'30 to 60 beds',3),
        (101,104,'60 to 100 beds',4),
        (101,105,'100 to 150 beds',5),
        (101,106,'More than 150 beds',6)
    `);

    await queryRunner.query(`
      INSERT INTO "knode_opd_band_masters"
        ("site_code","opd_band_code","opd_band_label","display_order") VALUES
        (101,101,'Under 50',1),
        (101,102,'50 to 150',2),
        (101,103,'150 to 300',3),
        (101,104,'More than 300',4)
    `);

    await queryRunner.query(`
      INSERT INTO "knode_contact_role_masters"
        ("site_code","contact_role_code","contact_role_label","display_order") VALUES
        (101,101,'Owner or director',1),
        (101,102,'Medical superintendent',2),
        (101,103,'Hospital administrator',3),
        (101,104,'Consultant doctor',4),
        (101,105,'IT in-charge',5),
        (101,106,'Accounts or billing',6),
        (101,107,'Other',7)
    `);

    await queryRunner.query(`
      INSERT INTO "knode_call_window_masters"
        ("site_code","call_window_code","call_window_label","display_order") VALUES
        (101,101,'Morning, 9 to 12',1),
        (101,102,'Afternoon, 12 to 4',2),
        (101,103,'Evening, 4 to 7',3)
    `);

    // --- requests ----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "knode_demo_requests" (
        "id"                     uuid NOT NULL DEFAULT uuid_generate_v4(),
        "site_code"              int  NOT NULL,
        "reference_no"           varchar(30)  NOT NULL,
        /*
         * Two intents, and both are kept.
         *
         * requested_intent is the radio the visitor actually chose. intent is
         * what it resolved to after the one rule the server knows better than
         * the browser: you cannot be shown software that has not shipped.
         *
         * They differ in exactly one case — somebody asked for a live demo of
         * an unreleased module — and that case is the most useful row on the
         * board. Keeping only the effective value would file a hot lead as a
         * waiting-list entry and lose the fact that they wanted a call now.
         */
        "requested_intent"       varchar(10)  NOT NULL,
        "intent"                 varchar(10)  NOT NULL,
        "facility_name"          varchar(200) NOT NULL,
        "facility_type_code"     int  NOT NULL,
        "bed_band_code"          int  NOT NULL,
        "opd_band_code"          int,
        "city"                   varchar(120) NOT NULL,
        "contact_person"         varchar(150) NOT NULL,
        "contact_role_code"      int,
        "phone"                  varchar(20)  NOT NULL,
        "email"                  varchar(255) NOT NULL,
        "call_window_code"       int,
        "notes"                  varchar(2000),
        "status"                 varchar(20),
        "notified_at"            timestamptz,
        "assigned_to"            varchar(150),
        "consent_at"             timestamptz,
        "privacy_notice_version" varchar(50),
        "source_page"            varchar(500),
        "ip_hash"                varchar(64),
        "user_agent"             varchar(500),
        "spam_score"             int NOT NULL DEFAULT 0,
        "is_deleted"             boolean NOT NULL DEFAULT false,
        "deleted_at"             timestamptz,
        "created_date"           timestamptz NOT NULL DEFAULT now(),
        "updated_date"           timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_knode_demo_requests_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_knode_demo_requests_reference_no_unique" UNIQUE ("reference_no"),
        CONSTRAINT "vtx_knode_demo_requests_site_code_fk"
          FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_knode_demo_requests_facility_type_code_fk"
          FOREIGN KEY ("facility_type_code") REFERENCES "knode_facility_type_masters"("facility_type_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_knode_demo_requests_bed_band_code_fk"
          FOREIGN KEY ("bed_band_code") REFERENCES "knode_bed_band_masters"("bed_band_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_knode_demo_requests_opd_band_code_fk"
          FOREIGN KEY ("opd_band_code") REFERENCES "knode_opd_band_masters"("opd_band_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_knode_demo_requests_contact_role_code_fk"
          FOREIGN KEY ("contact_role_code") REFERENCES "knode_contact_role_masters"("contact_role_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_knode_demo_requests_call_window_code_fk"
          FOREIGN KEY ("call_window_code") REFERENCES "knode_call_window_masters"("call_window_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_knode_demo_requests_intent_check"
          CHECK ("intent" IN ('DEMO','NOTIFY')),
        CONSTRAINT "vtx_knode_demo_requests_requested_intent_check"
          CHECK ("requested_intent" IN ('DEMO','NOTIFY')),
        /*
         * The resolution only ever goes one way. Asking to wait is always
         * honoured, so a NOTIFY request can never come out as a DEMO — if it
         * does, something has overridden a visitor who said "not yet".
         */
        CONSTRAINT "vtx_knode_demo_requests_intent_resolution_check"
          CHECK (NOT ("requested_intent" = 'NOTIFY' AND "intent" = 'DEMO')),
        /*
         * The two lifecycles never overlap, and this is what keeps them apart.
         * Without it a waiting-list entry could be marked DEMO_SCHEDULED and
         * would sit in the pipeline as work somebody thinks is underway.
         */
        CONSTRAINT "vtx_knode_demo_requests_lifecycle_check" CHECK (
          ("intent" = 'DEMO'
             -- IS NOT NULL is load-bearing, not belt and braces. A null
             -- compared with IN evaluates to NULL rather than false, and a
             -- CHECK passes on NULL — so without this a DEMO row carrying no
             -- status at all is accepted, and then sits in the pipeline
             -- invisible to every status filter that reads it.
             AND "status" IS NOT NULL
             AND "status" IN ('NEW','CONTACTED','DEMO_SCHEDULED','DEMO_DONE','WON','LOST')
             AND "notified_at" IS NULL)
          OR
          ("intent" = 'NOTIFY' AND "status" IS NULL)
        )
      )
    `);

    for (const [name, col] of [
      ['idx_knode_demo_requests_intent', 'intent'],
      ['idx_knode_demo_requests_status', 'status'],
      ['idx_knode_demo_requests_facility_name', 'facility_name'],
      ['idx_knode_demo_requests_city', 'city'],
      ['idx_knode_demo_requests_email', 'email'],
      ['idx_knode_demo_requests_created_date', 'created_date'],
    ] as const) {
      await queryRunner.query(
        `CREATE INDEX "${name}" ON "knode_demo_requests" ("${col}")`,
      );
    }

    /*
     * Partial index for the waiting list, which is the query the notify half
     * exists to serve: who has not been told yet.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_knode_demo_requests_waiting"
        ON "knode_demo_requests" ("notified_at")
        WHERE "intent" = 'NOTIFY' AND "notified_at" IS NULL AND "is_deleted" = false
    `);

    // --- modules asked about ------------------------------------------------
    //
    // A join table rather than an array column, because "how many are waiting
    // for Pharmacy" is the question this data exists to answer — on an array
    // that is a scan, here it is an index.
    await queryRunner.query(`
      CREATE TABLE "knode_demo_request_modules" (
        "id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
        "request_id"   uuid NOT NULL,
        "module_code"  int  NOT NULL,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_knode_demo_request_modules_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_knode_demo_request_modules_unique" UNIQUE ("request_id","module_code"),
        CONSTRAINT "vtx_knode_demo_request_modules_request_id_fk"
          FOREIGN KEY ("request_id") REFERENCES "knode_demo_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_knode_demo_request_modules_module_code_fk"
          FOREIGN KEY ("module_code") REFERENCES "knode_module_masters"("module_code") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_knode_demo_request_modules_request_id" ON "knode_demo_request_modules" ("request_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_knode_demo_request_modules_module_code" ON "knode_demo_request_modules" ("module_code")`,
    );

    // --- timeline -----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "knode_demo_request_events" (
        "id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
        "request_id"   uuid NOT NULL,
        "event_type"   varchar(30) NOT NULL,
        "actor"        varchar(150),
        "note"         varchar(2000),
        "metadata"     jsonb,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_knode_demo_request_events_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_knode_demo_request_events_request_id_fk"
          FOREIGN KEY ("request_id") REFERENCES "knode_demo_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_knode_demo_request_events_event_type_check"
          CHECK ("event_type" IN ('CREATED','STATUS_CHANGED','ASSIGNED','NOTE_ADDED','NOTIFIED'))
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_knode_demo_request_events_request_id" ON "knode_demo_request_events" ("request_id")`,
    );

    // --- reference sequences ------------------------------------------------
    //
    // Two, so the reference says what it is: KND-DMO for a demo somebody will
    // be given, KND-NTF for a place on a waiting list.
    await queryRunner.query(
      `CREATE SEQUENCE "knode_demo_ref_seq" START WITH 1`,
    );
    await queryRunner.query(
      `CREATE SEQUENCE "knode_notify_ref_seq" START WITH 1`,
    );

    // --- feature and grants -------------------------------------------------
    await queryRunner.query(`
      INSERT INTO "feature_masters" ("feature_code","feature_name","description")
      VALUES (115,'KNODE_DEMO','Book a demo submissions from knode.veltrixair.com.')
      ON CONFLICT ("feature_code") DO NOTHING
    `);

    // Super Admin's grants were seeded by a CROSS JOIN when the auth module was
    // created, so a feature added later inherits nothing and must be named.
    // Sales gets it because this is their pipeline; nobody else does.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code","feature_code","permission_code")
      SELECT r.code, 115, p.code
      FROM (VALUES (101),(104)) AS r(code)
      CROSS JOIN (VALUES (101),(102),(103),(104)) AS p(code)
      ON CONFLICT ("role_code","feature_code","permission_code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "feature_code" = 115`,
    );
    await queryRunner.query(
      `DELETE FROM "feature_masters" WHERE "feature_code" = 115`,
    );
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "knode_notify_ref_seq"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "knode_demo_ref_seq"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knode_demo_request_events"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "knode_demo_request_modules"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "knode_demo_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knode_module_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knode_call_window_masters"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "knode_contact_role_masters"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "knode_opd_band_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knode_bed_band_masters"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "knode_facility_type_masters"`,
    );
  }
}
