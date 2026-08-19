import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Request a Quote — veltrixairindustries.com/quote/
 *
 * The largest form in the system: five sections, around fifty fields. Two
 * decisions shape the schema.
 *
 * 1. FIXED DROPDOWNS GET TABLES. Service line, crane type, OEM, city, urgency,
 *    budget and so on are what sales filters and reports on, so each is a
 *    master with a real foreign key.
 *
 * 2. SECTION 04 GOES IN JSONB. That section is six different questionnaires —
 *    one per service line — and only one applies to any submission. As columns
 *    it would be ~20 fields that sit NULL five-sixths of the time, plus twenty
 *    master tables nobody ever filters on. `scope_detail` holds whichever
 *    answers apply; the permitted keys and values are declared per service line
 *    in crane-quote.constants.ts and enforced at submit, so the database is not
 *    the thing policing them.
 *
 *    The exception proves the rule: "Crane Down Right Now?" lives inside that
 *    questionnaire but is ALSO a real `priority` column, because the pipeline
 *    is sorted by it. Anything that drives routing or an SLA gets promoted out
 *    of the JSON.
 *
 * These tables are crane-only, so their codes start at 101 like everything
 * else. Only masters SHARED between brands need a per-site range — see
 * ScopeIndustryMasters for that case.
 */
export class CreateCraneQuoteModule1785859200000 implements MigrationInterface {
  name = 'CreateCraneQuoteModule1785859200000';

  /** [table, codeColumn, nameColumn, nameLength] */
  private readonly masters: [string, string, string, number][] = [
    [
      'crane_service_line_masters',
      'service_line_code',
      'service_line_name',
      120,
    ],
    ['crane_urgency_masters', 'urgency_code', 'urgency_name', 120],
    ['crane_lead_source_masters', 'lead_source_code', 'lead_source_name', 120],
    ['crane_site_city_masters', 'site_city_code', 'site_city_name', 120],
    ['crane_site_access_masters', 'site_access_code', 'site_access_name', 150],
    ['crane_type_masters', 'crane_type_code', 'crane_type_name', 150],
    ['crane_oem_masters', 'oem_code', 'oem_name', 120],
    ['crane_environment_masters', 'environment_code', 'environment_name', 150],
    ['crane_duty_class_masters', 'duty_class_code', 'duty_class_name', 150],
    ['crane_budget_band_masters', 'budget_band_code', 'budget_band_name', 120],
    [
      'crane_completion_timeline_masters',
      'completion_timeline_code',
      'completion_timeline_name',
      120,
    ],
    ['crane_procurement_masters', 'procurement_code', 'procurement_name', 120],
    [
      'crane_payment_terms_masters',
      'payment_terms_code',
      'payment_terms_name',
      120,
    ],
    [
      'crane_proposal_doc_masters',
      'proposal_doc_code',
      'proposal_doc_name',
      150,
    ],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------- masters

    for (const [table, codeCol, nameCol, len] of this.masters) {
      await queryRunner.query(`
        CREATE TABLE "${table}" (
          "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
          "${codeCol}"    integer NOT NULL,
          "${nameCol}"    character varying(${len}) NOT NULL,
          "display_order" integer NOT NULL DEFAULT 0,
          "is_active"     boolean NOT NULL DEFAULT true,
          "is_deleted"    boolean NOT NULL DEFAULT false,
          "deleted_at"    timestamptz,
          "created_date"  timestamptz NOT NULL DEFAULT now(),
          "updated_date"  timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT "vtx_${table}_id_pk" PRIMARY KEY ("id"),
          CONSTRAINT "vtx_${table}_${codeCol}_unique" UNIQUE ("${codeCol}")
        )
      `);
    }

    const seed = async (
      table: string,
      codeCol: string,
      nameCol: string,
      values: string[],
    ) => {
      const rows = values
        .map((v, i) => `(${101 + i}, '${v.replace(/'/g, "''")}', ${i + 1})`)
        .join(',\n        ');
      await queryRunner.query(`
        INSERT INTO "${table}" ("${codeCol}", "${nameCol}", "display_order") VALUES
        ${rows}
      `);
    };

    // The six service lines, plus the catch-all the form offers.
    await seed(
      'crane_service_line_masters',
      'service_line_code',
      'service_line_name',
      [
        'Crane Installation & Commissioning',
        'Self-Standing Structure Installation',
        'Crane Dismantling & Decommissioning',
        'Site Clearance & Structure Removal',
        'Statutory Inspections & Load Testing',
        '24/7 Breakdown Response',
        'Multiple services / Strategic discussion',
      ],
    );

    await seed('crane_urgency_masters', 'urgency_code', 'urgency_name', [
      'Emergency — production stopped',
      'Urgent — within 7 days',
      'Standard — within 1-3 months',
      'Strategic planning — 3+ months',
    ]);

    await seed(
      'crane_lead_source_masters',
      'lead_source_code',
      'lead_source_name',
      [
        'Web search',
        'Referral / word of mouth',
        'Existing client / past project',
        'OEM recommendation',
        'Industry event / exhibition',
        'LinkedIn',
        'Other',
      ],
    );

    await seed('crane_site_city_masters', 'site_city_code', 'site_city_name', [
      'Riyadh',
      'Jeddah',
      'Mecca',
      'Medina',
      'Dammam',
      'Al-Khobar',
      'Jubail',
      'Yanbu',
      'Hofuf / Al-Ahsa',
      'Tabuk',
      'Hail',
      'Khamis Mushayt',
      'Abha',
      'Najran',
      'Al-Kharj',
      'Buraidah',
      'Taif',
      'NEOM',
      'Qiddiya',
      'Red Sea Project',
      'AMAAL',
      'Diriyah Gate',
      'Other KSA location (Zone 03)',
    ]);

    // Access regime drives mobilisation cost and lead time more than anything
    // else on this form — an Aramco SAES site is weeks of clearance.
    await seed(
      'crane_site_access_masters',
      'site_access_code',
      'site_access_name',
      [
        'Standard industrial site',
        'HCIS-regulated facility',
        'Saudi Aramco SAES site',
        'SABIC industrial city',
        "Ma'aden facility",
        'Royal Commission city (Jubail/Yanbu)',
        'Defence / restricted access',
        'Greenfield / construction site',
        'Port / marine restricted',
      ],
    );

    await seed('crane_type_masters', 'crane_type_code', 'crane_type_name', [
      'EOT — Single Girder',
      'EOT — Double Girder',
      'Gantry Crane',
      'Semi-Gantry Crane',
      'Jib Crane — Wall Mounted',
      'Jib Crane — Pillar Mounted',
      'Workshop / Light Duty',
      'Process Crane (Steel / Foundry / Hot Metal)',
      'Self-Standing — Portal Frame',
      'Self-Standing — A-Frame',
      'Mobile / Truck Crane',
      'Tower Crane',
      'Multiple types / mixed fleet',
      'Other / Unknown',
    ]);

    await seed('crane_oem_masters', 'oem_code', 'oem_name', [
      'Demag (Konecranes)',
      'Konecranes',
      'Stahl CraneSystems',
      'ABUS',
      'SWF Krantechnik',
      'Verlinde',
      'R&M / Munck',
      'Street Crane',
      'Liebherr',
      'Kone (legacy)',
      'Local fabrication / unbranded',
      'Multiple OEMs',
      'Other',
      'Unknown',
    ]);

    await seed(
      'crane_environment_masters',
      'environment_code',
      'environment_name',
      [
        'Indoor — general industrial',
        'Outdoor — covered / canopy',
        'Outdoor — open exposed',
        'Marine / coastal corrosive',
        'Hot metal / foundry',
        'Hazardous area (ATEX / IECEx)',
        'Cleanroom / pharmaceutical',
        'Cold storage / freezer',
        'Dusty / cement / silica',
      ],
    );

    await seed(
      'crane_duty_class_masters',
      'duty_class_code',
      'duty_class_name',
      [
        'FEM 1Am / ISO M3 — Light duty',
        'FEM 1Bm / ISO M4 — Light-medium',
        'FEM 2m / ISO M5 — Medium duty',
        'FEM 3m / ISO M6 — Heavy duty',
        'FEM 4m / ISO M7 — Very heavy',
        'FEM 5m / ISO M8 — Continuous heavy',
        'Unknown — to be assessed',
      ],
    );

    await seed(
      'crane_budget_band_masters',
      'budget_band_code',
      'budget_band_name',
      [
        'Under SAR 50,000',
        'SAR 50,000 — 250,000',
        'SAR 250,000 — 1M',
        'SAR 1M — 5M',
        'SAR 5M — 25M',
        'SAR 25M+',
        'TBD — quote against scope',
        'Confidential — discuss in person',
      ],
    );

    await seed(
      'crane_completion_timeline_masters',
      'completion_timeline_code',
      'completion_timeline_name',
      [
        'Emergency — now',
        'Urgent — within 7 days',
        'Within 1 month',
        '1 — 3 months',
        '3 — 6 months',
        '6 — 12 months',
        '12+ months / strategic',
        'Flexible',
      ],
    );

    await seed(
      'crane_procurement_masters',
      'procurement_code',
      'procurement_name',
      [
        'Direct purchase order',
        'RFQ / formal quote',
        'RFP — full proposal',
        'Open tender',
        'Framework agreement / call-off',
        'Emergency direct award',
      ],
    );

    await seed(
      'crane_payment_terms_masters',
      'payment_terms_code',
      'payment_terms_name',
      [
        'Standard — net 30 days',
        'Net 60 days',
        'Milestone-based',
        'Upfront % + balance on delivery',
        'Letter of Credit',
        'Open to discussion',
      ],
    );

    await seed(
      'crane_proposal_doc_masters',
      'proposal_doc_code',
      'proposal_doc_name',
      [
        'Technical proposal',
        'Commercial pricing pack',
        'Detailed BoQ',
        'Project schedule (Gantt)',
        'SLA appendix',
        'Reference projects',
        'Compliance certifications',
        'HSE / RAMS pack',
        'Replacement economics / ROI appendix',
      ],
    );

    // ------------------------------------------------------- the quote itself

    await queryRunner.query(`
      CREATE TABLE "crane_quote_requests" (
        "id"                       uuid NOT NULL DEFAULT gen_random_uuid(),
        "reference_no"             character varying(30) NOT NULL,
        "site_code"                integer NOT NULL,

        "service_line_code"        integer NOT NULL,
        "urgency_code"             integer NOT NULL,
        "lead_source_code"         integer,

        "company_name"             character varying(200) NOT NULL,
        "industry_code"            integer NOT NULL,
        "contact_name"             character varying(150) NOT NULL,
        "contact_position"         character varying(150),
        "business_email"           character varying(255) NOT NULL,
        "mobile"                   character varying(30) NOT NULL,
        "existing_client"          character varying(20) NOT NULL,
        "preferred_contact"        character varying(20) NOT NULL,

        "site_city_code"           integer NOT NULL,
        "site_access_code"         integer,
        "crane_count"              integer,
        "crane_type_code"          integer NOT NULL,
        "oem_code"                 integer NOT NULL,
        "swl_tonnes"               numeric(8,2),
        "year_of_manufacture"      integer,
        "environment_code"         integer NOT NULL,
        "span_lift_height"         character varying(150),
        "duty_class_code"          integer,

        "scope_detail"             jsonb,

        "budget_band_code"         integer,
        "completion_timeline_code" integer,
        "procurement_code"         integer,
        "payment_terms_code"       integer,
        "project_description"      character varying(5000) NOT NULL,
        "constraints_concerns"     character varying(5000),

        "priority"                 character varying(10) NOT NULL DEFAULT 'P4',
        "status"                   character varying(20) NOT NULL DEFAULT 'NEW',
        "assigned_to"              character varying(150),
        "manage_token"             character varying(64) NOT NULL,

        "triage_due_at"            timestamptz NOT NULL,
        "site_visit_due_at"        timestamptz NOT NULL,
        "proposal_due_at"          timestamptz NOT NULL,
        "first_responded_at"       timestamptz,

        "consent_at"               timestamptz NOT NULL,
        "privacy_notice_version"   character varying(50) NOT NULL,
        "marketing_opt_in"         boolean NOT NULL DEFAULT false,
        "marketing_opt_in_at"      timestamptz,

        "source_page"              character varying(500),
        "ip_hash"                  character varying(64),
        "user_agent"               character varying(500),
        "spam_score"               integer NOT NULL DEFAULT 0,

        "is_deleted"               boolean NOT NULL DEFAULT false,
        "deleted_at"               timestamptz,
        "created_date"             timestamptz NOT NULL DEFAULT now(),
        "updated_date"             timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "vtx_crane_quote_requests_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_crane_quote_requests_reference_no_unique" UNIQUE ("reference_no"),
        CONSTRAINT "vtx_crane_quote_requests_manage_token_unique" UNIQUE ("manage_token"),
        CONSTRAINT "vtx_crane_quote_requests_existing_client_check"
          CHECK ("existing_client" IN ('NO','ACTIVE_AMC','PAST_PROJECTS','UNSURE')),
        CONSTRAINT "vtx_crane_quote_requests_preferred_contact_check"
          CHECK ("preferred_contact" IN ('EMAIL','PHONE','WHATSAPP','SITE_VISIT','VIDEO')),
        CONSTRAINT "vtx_crane_quote_requests_priority_check"
          CHECK ("priority" IN ('P1','P2','P3','P4')),
        CONSTRAINT "vtx_crane_quote_requests_status_check"
          CHECK ("status" IN ('NEW','TRIAGE','SITE_VISIT','PROPOSAL_SENT','WON','LOST','WITHDRAWN')),
        CONSTRAINT "vtx_crane_quote_requests_year_check"
          CHECK ("year_of_manufacture" IS NULL OR "year_of_manufacture" BETWEEN 1900 AND 2100)
      )
    `);

    const fks: [string, string, string, string][] = [
      ['site_code', 'site_masters', 'site_code', 'RESTRICT'],
      [
        'service_line_code',
        'crane_service_line_masters',
        'service_line_code',
        'RESTRICT',
      ],
      ['urgency_code', 'crane_urgency_masters', 'urgency_code', 'RESTRICT'],
      [
        'lead_source_code',
        'crane_lead_source_masters',
        'lead_source_code',
        'RESTRICT',
      ],
      ['industry_code', 'industry_masters', 'industry_code', 'RESTRICT'],
      [
        'site_city_code',
        'crane_site_city_masters',
        'site_city_code',
        'RESTRICT',
      ],
      [
        'site_access_code',
        'crane_site_access_masters',
        'site_access_code',
        'RESTRICT',
      ],
      ['crane_type_code', 'crane_type_masters', 'crane_type_code', 'RESTRICT'],
      ['oem_code', 'crane_oem_masters', 'oem_code', 'RESTRICT'],
      [
        'environment_code',
        'crane_environment_masters',
        'environment_code',
        'RESTRICT',
      ],
      [
        'duty_class_code',
        'crane_duty_class_masters',
        'duty_class_code',
        'RESTRICT',
      ],
      [
        'budget_band_code',
        'crane_budget_band_masters',
        'budget_band_code',
        'RESTRICT',
      ],
      [
        'completion_timeline_code',
        'crane_completion_timeline_masters',
        'completion_timeline_code',
        'RESTRICT',
      ],
      [
        'procurement_code',
        'crane_procurement_masters',
        'procurement_code',
        'RESTRICT',
      ],
      [
        'payment_terms_code',
        'crane_payment_terms_masters',
        'payment_terms_code',
        'RESTRICT',
      ],
    ];

    for (const [column, refTable, refColumn, onDelete] of fks) {
      await queryRunner.query(`
        ALTER TABLE "crane_quote_requests"
          ADD CONSTRAINT "vtx_crane_quote_requests_${column}_fk"
          FOREIGN KEY ("${column}") REFERENCES "${refTable}"("${refColumn}") ON DELETE ${onDelete}
      `);
    }

    // ------------------------------------------------------------ many-to-many

    await queryRunner.query(`
      CREATE TABLE "crane_quote_additional_services" (
        "quote_id"          uuid NOT NULL,
        "service_line_code" integer NOT NULL,
        CONSTRAINT "vtx_crane_quote_additional_services_pk"
          PRIMARY KEY ("quote_id", "service_line_code"),
        CONSTRAINT "vtx_crane_quote_additional_services_quote_id_fk"
          FOREIGN KEY ("quote_id") REFERENCES "crane_quote_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_crane_quote_additional_services_service_line_code_fk"
          FOREIGN KEY ("service_line_code") REFERENCES "crane_service_line_masters"("service_line_code") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "crane_quote_required_documents" (
        "quote_id"          uuid NOT NULL,
        "proposal_doc_code" integer NOT NULL,
        CONSTRAINT "vtx_crane_quote_required_documents_pk"
          PRIMARY KEY ("quote_id", "proposal_doc_code"),
        CONSTRAINT "vtx_crane_quote_required_documents_quote_id_fk"
          FOREIGN KEY ("quote_id") REFERENCES "crane_quote_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_crane_quote_required_documents_proposal_doc_code_fk"
          FOREIGN KEY ("proposal_doc_code") REFERENCES "crane_proposal_doc_masters"("proposal_doc_code") ON DELETE RESTRICT
      )
    `);

    // Drawings, capacity plates, inspection certificates — several per quote.
    await queryRunner.query(`
      CREATE TABLE "crane_quote_attachments" (
        "quote_id"     uuid NOT NULL,
        "file_id"      uuid NOT NULL,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_crane_quote_attachments_pk" PRIMARY KEY ("quote_id", "file_id"),
        CONSTRAINT "vtx_crane_quote_attachments_quote_id_fk"
          FOREIGN KEY ("quote_id") REFERENCES "crane_quote_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_crane_quote_attachments_file_id_fk"
          FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "crane_quote_events" (
        "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
        "quote_id"     uuid NOT NULL,
        "event_type"   character varying(30) NOT NULL,
        "actor"        character varying(150),
        "note"         character varying(2000),
        "metadata"     jsonb,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_crane_quote_events_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_crane_quote_events_quote_id_fk"
          FOREIGN KEY ("quote_id") REFERENCES "crane_quote_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_crane_quote_events_event_type_check"
          CHECK ("event_type" IN ('CREATED','STATUS_CHANGED','ASSIGNED','NOTE_ADDED','ATTACHMENT_VIEWED','NOTIFICATION_SENT','ESCALATED'))
      )
    `);

    // ---------------------------------------------------------------- indexes

    for (const [name, table, cols] of [
      [
        'idx_crane_quote_requests_reference_no',
        'crane_quote_requests',
        '"reference_no"',
      ],
      [
        'idx_crane_quote_requests_site_code',
        'crane_quote_requests',
        '"site_code"',
      ],
      ['idx_crane_quote_requests_status', 'crane_quote_requests', '"status"'],
      [
        'idx_crane_quote_requests_service_line',
        'crane_quote_requests',
        '"service_line_code"',
      ],
      [
        'idx_crane_quote_requests_site_city',
        'crane_quote_requests',
        '"site_city_code"',
      ],
      [
        'idx_crane_quote_requests_email',
        'crane_quote_requests',
        '"business_email"',
      ],
      ['idx_crane_quote_events_quote_id', 'crane_quote_events', '"quote_id"'],
    ] as [string, string, string][]) {
      await queryRunner.query(`CREATE INDEX "${name}" ON "${table}" (${cols})`);
    }

    // The queue a responder actually watches: open work, worst first.
    await queryRunner.query(`
      CREATE INDEX "idx_crane_quote_requests_open_priority"
        ON "crane_quote_requests" ("priority", "triage_due_at")
        WHERE "is_deleted" = false AND "status" IN ('NEW','TRIAGE','SITE_VISIT')
    `);

    await queryRunner.query(
      `CREATE SEQUENCE "crane_quote_ref_seq" START WITH 1 INCREMENT BY 1`,
    );

    // ------------------------------------------------- feature 108 and grants

    await queryRunner.query(`
      INSERT INTO "feature_masters" ("feature_code", "feature_name", "description")
      VALUES (108, 'CRANE_QUOTES', 'Request-a-quote submissions for Veltrixair Industries')
    `);

    // SUPER_ADMIN was seeded by a CROSS JOIN over the features that existed at
    // the time, so every new feature needs granting explicitly or the super
    // admin gets a 403 on a surface it should own.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      SELECT 101, 108, p."permission_code" FROM "permission_masters" p
    `);

    // SALES owns the quote pipeline. The role means the same on every brand;
    // site scoping is what stops an IT salesperson reaching crane quotes.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      SELECT 104, 108, p."permission_code" FROM "permission_masters" p
    `);

    // VIEWER reads the pipeline but never edits it.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      VALUES (105, 108, 101)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "feature_code" = 108`,
    );
    await queryRunner.query(
      `DELETE FROM "feature_masters" WHERE "feature_code" = 108`,
    );
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "crane_quote_ref_seq"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crane_quote_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crane_quote_attachments"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "crane_quote_required_documents"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "crane_quote_additional_services"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "crane_quote_requests"`);

    for (const [table] of this.masters) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
