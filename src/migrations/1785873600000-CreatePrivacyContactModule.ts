import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The contact form on dataprivacy.veltrixair.com, on its own tables.
 *
 * An earlier attempt ran this on the shared `contact_enquiries` table, since
 * seven of its eight fields already existed there. That was reverted: the
 * privacy practice expects its intake to diverge from the IT one — data subject
 * requests, breach notifications and regulator correspondence all plausibly
 * land here later, and none of them belong in a table shaped around sales
 * leads. Paying for the separation now is cheaper than unpicking a shared table
 * once both brands depend on its columns.
 *
 * Only the fields the live form actually collects are modelled. Nothing is
 * added in anticipation of those future flows — when they arrive they bring
 * their own columns, and this table is free to grow without asking whether the
 * IT form minds.
 *
 * Codes stay in the 3xx privacy block, the same convention the shared masters
 * used, so nothing has to be renumbered if data ever moves between them.
 */
export class CreatePrivacyContactModule1785873600000 implements MigrationInterface {
  name = 'CreatePrivacyContactModule1785873600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------- masters ---
    // Jurisdiction rather than country: "EU / UK" spans many, "Multi-
    // jurisdiction" names none, and "Qatar / Kuwait / Bahrain" is a grouping.
    // What the practice needs to know is which law applies. `office_code`
    // carries the same meaning it does on `country_masters` — it decides which
    // working week the response clock runs on.
    await queryRunner.query(`
      CREATE TABLE "privacy_jurisdiction_masters" (
        "id"                uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_code"         integer NOT NULL,
        "jurisdiction_code" integer NOT NULL,
        "jurisdiction_name" character varying(120) NOT NULL,
        "regulation"        character varying(60) NOT NULL,
        "office_code"       integer NOT NULL,
        "display_order"     integer NOT NULL DEFAULT 0,
        "is_active"         boolean NOT NULL DEFAULT true,
        "is_deleted"        boolean NOT NULL DEFAULT false,
        "deleted_at"        timestamptz,
        "created_date"      timestamptz NOT NULL DEFAULT now(),
        "updated_date"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_privacy_jurisdiction_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_privacy_jurisdiction_masters_code_uq" UNIQUE ("jurisdiction_code"),
        CONSTRAINT "vtx_privacy_jurisdiction_masters_site_code_fk"
          FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_privacy_jurisdiction_masters_office_code_fk"
          FOREIGN KEY ("office_code") REFERENCES "office_masters"("office_code") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "privacy_service_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_code"     integer NOT NULL,
        "service_code"  integer NOT NULL,
        "service_name"  character varying(150) NOT NULL,
        "route_email"   character varying(255) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_privacy_service_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_privacy_service_masters_code_uq" UNIQUE ("service_code"),
        CONSTRAINT "vtx_privacy_service_masters_site_code_fk"
          FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT
      )
    `);

    // ------------------------------------------------------------- offices ---
    // The working hours published on the contact page. Operational rather than
    // descriptive: the response clock runs on these, so Riyadh is Sunday to
    // Thursday and the India office Monday to Friday.
    await queryRunner.query(`
      INSERT INTO "office_masters"
        ("site_code","office_code","office_name","city","country_name","address","email",
         "timezone","working_days","work_start_hour","work_end_hour","display_order")
      VALUES
        (103, 301, 'Riyadh', 'Riyadh', 'Saudi Arabia',
         'King Fahd District, Riyadh, Kingdom of Saudi Arabia', 'info@veltrixair.com',
         'Asia/Riyadh', '{0,1,2,3,4}', 9, 18, 1),
        (103, 302, 'India Delivery', 'Bengaluru', 'India',
         'Bengaluru / Mumbai delivery presence', 'info@veltrixair.com',
         'Asia/Kolkata', '{1,2,3,4,5}', 9, 18, 2)
    `);

    // Gulf and EU/UK work sits with Riyadh, India work with the India office.
    // Multi-jurisdiction goes to Riyadh as the practice seat rather than being
    // left for the router to guess.
    await queryRunner.query(`
      INSERT INTO "privacy_jurisdiction_masters"
        ("site_code","jurisdiction_code","jurisdiction_name","regulation","office_code","display_order")
      VALUES
        (103, 301, 'KSA — Saudi Arabia',       'PDPL',          301, 1),
        (103, 302, 'UAE — Federal',            'PDPL',          301, 2),
        (103, 303, 'India',                    'DPDP Act 2023', 302, 3),
        (103, 304, 'Qatar / Kuwait / Bahrain', 'PDPL',          301, 4),
        (103, 305, 'EU / UK',                  'GDPR',          301, 5),
        (103, 306, 'Multi-jurisdiction',       'Multiple',      301, 6)
    `);

    // All seven route to info@ today. The column exists so any one of them can
    // be split off later without a deploy.
    await queryRunner.query(`
      INSERT INTO "privacy_service_masters"
        ("site_code","service_code","service_name","route_email","display_order")
      VALUES
        (103, 301, 'Privacy Readiness & Compliance Assessment',            'info@veltrixair.com', 1),
        (103, 302, 'Data Discovery & Privacy Mapping',                     'info@veltrixair.com', 2),
        (103, 303, 'Privacy Impact & Risk Assessments (DPIA / PIA / TIA)', 'info@veltrixair.com', 3),
        (103, 304, 'Privacy Program Design & Implementation',              'info@veltrixair.com', 4),
        (103, 305, 'Privacy Operations & Controls',                        'info@veltrixair.com', 5),
        (103, 306, 'Regulatory Advisory & DPO-as-a-Service',               'info@veltrixair.com', 6),
        (103, 307, 'Not yet sure — exploratory call',                      'info@veltrixair.com', 7)
    `);

    // ------------------------------------------------------------ enquiries ---
    // `consent_at` is nullable and unused today: the form has no consent tick,
    // because answering a business enquiry is a pre-contractual step under
    // PDPL, GDPR and DPDP alike. `lawful_basis` records which ground was relied
    // on, so the file says why the data is held rather than leaving it implied.
    await queryRunner.query(`
      CREATE TABLE "privacy_contact_enquiries" (
        "id"                     uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_code"              integer NOT NULL,
        "reference_no"           character varying(30) NOT NULL,

        "full_name"              character varying(150) NOT NULL,
        "organisation"           character varying(150) NOT NULL,
        "work_email"             character varying(255) NOT NULL,
        "phone"                  character varying(32),
        "role_title"             character varying(150),

        "jurisdiction_code"      integer NOT NULL,
        "service_code"           integer NOT NULL,
        "brief"                  character varying(2000) NOT NULL,

        "lawful_basis"           character varying(30) NOT NULL DEFAULT 'LEGITIMATE_INTEREST',
        "consent_at"             timestamptz,
        "privacy_notice_version" character varying(50) NOT NULL,

        "office_code"            integer NOT NULL,
        "routed_to_email"        character varying(255) NOT NULL,
        "sla_due_at"             timestamptz NOT NULL,
        "first_responded_at"     timestamptz,

        "status"                 character varying(20) NOT NULL DEFAULT 'NEW',
        "assigned_to"            character varying(150),
        "assigned_at"            timestamptz,

        "source_page"            character varying(500),
        "utm_source"             character varying(100),
        "utm_medium"             character varying(100),
        "utm_campaign"           character varying(100),
        "ip_hash"                character varying(64),
        "user_agent"             character varying(500),
        "spam_score"             integer NOT NULL DEFAULT 0,

        "is_deleted"             boolean NOT NULL DEFAULT false,
        "deleted_at"             timestamptz,
        "created_date"           timestamptz NOT NULL DEFAULT now(),
        "updated_date"           timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "vtx_privacy_contact_enquiries_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_privacy_contact_enquiries_reference_no_uq" UNIQUE ("reference_no"),
        CONSTRAINT "vtx_privacy_contact_enquiries_site_code_fk"
          FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_privacy_contact_enquiries_jurisdiction_code_fk"
          FOREIGN KEY ("jurisdiction_code")
          REFERENCES "privacy_jurisdiction_masters"("jurisdiction_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_privacy_contact_enquiries_service_code_fk"
          FOREIGN KEY ("service_code")
          REFERENCES "privacy_service_masters"("service_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_privacy_contact_enquiries_office_code_fk"
          FOREIGN KEY ("office_code") REFERENCES "office_masters"("office_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_privacy_contact_enquiries_status_check"
          CHECK ("status" IN ('NEW','IN_PROGRESS','RESOLVED','CLOSED','SPAM')),
        CONSTRAINT "vtx_privacy_contact_enquiries_lawful_basis_check"
          CHECK ("lawful_basis" IN ('CONSENT','LEGITIMATE_INTEREST')),
        -- A row may never claim consent without the timestamp proving it.
        CONSTRAINT "vtx_privacy_contact_enquiries_consent_evidence_check"
          CHECK ("lawful_basis" <> 'CONSENT' OR "consent_at" IS NOT NULL),
        -- Assignment and its timestamp move together; one without the other is
        -- a bug that would quietly break "how long has this sat with them".
        CONSTRAINT "vtx_privacy_contact_enquiries_assigned_check"
          CHECK (("assigned_to" IS NULL) = ("assigned_at" IS NULL))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "privacy_contact_events" (
        "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
        "enquiry_id"   uuid NOT NULL,
        "event_type"   character varying(30) NOT NULL,
        "actor"        character varying(150),
        "note"         character varying(2000),
        "metadata"     jsonb,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_privacy_contact_events_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_privacy_contact_events_enquiry_id_fk"
          FOREIGN KEY ("enquiry_id")
          REFERENCES "privacy_contact_enquiries"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_privacy_contact_events_event_type_check"
          CHECK ("event_type" IN ('CREATED','STATUS_CHANGED','ASSIGNED','UNASSIGNED','NOTE_ADDED','NOTIFICATION_SENT'))
      )
    `);

    for (const [name, table, cols] of [
      [
        'idx_privacy_contact_enquiries_site_code',
        'privacy_contact_enquiries',
        '"site_code"',
      ],
      [
        'idx_privacy_contact_enquiries_status',
        'privacy_contact_enquiries',
        '"status"',
      ],
      [
        'idx_privacy_contact_enquiries_jurisdiction',
        'privacy_contact_enquiries',
        '"jurisdiction_code"',
      ],
      [
        'idx_privacy_contact_enquiries_service',
        'privacy_contact_enquiries',
        '"service_code"',
      ],
      [
        'idx_privacy_contact_enquiries_created',
        'privacy_contact_enquiries',
        '"created_date"',
      ],
      [
        'idx_privacy_contact_events_enquiry',
        'privacy_contact_events',
        '"enquiry_id"',
      ],
      [
        'idx_privacy_jurisdiction_masters_site',
        'privacy_jurisdiction_masters',
        '"site_code"',
      ],
      [
        'idx_privacy_service_masters_site',
        'privacy_service_masters',
        '"site_code"',
      ],
    ]) {
      await queryRunner.query(`CREATE INDEX "${name}" ON "${table}" (${cols})`);
    }

    await queryRunner.query(
      `CREATE SEQUENCE "privacy_contact_ref_seq" START WITH 1 INCREMENT BY 1`,
    );

    // ------------------------------------------------- feature 110 and grants
    await queryRunner.query(`
      INSERT INTO "feature_masters" ("feature_code", "feature_name", "description")
      VALUES (110, 'PRIVACY_ENQUIRIES', 'Contact enquiries for the data privacy practice')
    `);

    // SUPER_ADMIN never inherits new features — it was seeded by a CROSS JOIN
    // over the features that existed then, so every addition needs this line.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      SELECT 101, 110, p."permission_code" FROM "permission_masters" p
    `);

    // VIEWER reads. SALES is deliberately left out: privacy enquiries go to a
    // practitioner, not to a sales pipeline. Adding a role later is a data
    // action through the staff endpoints; adding a role's ACCESS to a feature
    // is a migration, so this line is the decision, not a default.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      VALUES (105, 110, 101)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "feature_code" = 110`,
    );
    await queryRunner.query(
      `DELETE FROM "feature_masters" WHERE "feature_code" = 110`,
    );
    await queryRunner.query(
      `DROP SEQUENCE IF EXISTS "privacy_contact_ref_seq"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "privacy_contact_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "privacy_contact_enquiries"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "privacy_jurisdiction_masters"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "privacy_service_masters"`);
    await queryRunner.query(
      `DELETE FROM "office_masters" WHERE "site_code" = 103`,
    );
  }
}
