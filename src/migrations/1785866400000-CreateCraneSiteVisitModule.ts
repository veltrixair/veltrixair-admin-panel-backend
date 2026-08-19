import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Request a Site Visit — veltrixairindustries.com/site-visit/
 *
 * "Bring an engineer, before we bring a quote." A site visit usually precedes
 * a quote, which is why `quote_id` exists: nullable, because most arrive cold
 * from this page, but set when a visit is scoped out of an existing enquiry.
 *
 * EIGHT MASTERS ARE REUSED, NOT DUPLICATED. Service line, industry, site city,
 * access regime, crane type, OEM, operating environment and lead source are the
 * same lists the quote form uses. The two pages render them slightly
 * differently — the visit page omits Tower Crane and Kone (legacy) — but that
 * reads as editorial drift, not intent. A crane is a crane whichever form you
 * arrived on, and two near-identical tables is how you end up adding an OEM to
 * one and forgetting the other.
 *
 * Eleven masters ARE new, because they only make sense for a visit: what the
 * engineer is coming to do, how long for, what access and PPE they will need,
 * and whether anyone is paying for it.
 *
 * No JSONB here. Unlike the quote form there is no conditional questionnaire —
 * every field applies to every submission, so every field is a column.
 */
export class CreateCraneSiteVisitModule1785866400000 implements MigrationInterface {
  name = 'CreateCraneSiteVisitModule1785866400000';

  /** [table, codeColumn, nameColumn, nameLength] */
  private readonly masters: [string, string, string, number][] = [
    [
      'crane_visit_purpose_masters',
      'visit_purpose_code',
      'visit_purpose_name',
      200,
    ],
    [
      'crane_visit_urgency_masters',
      'visit_urgency_code',
      'visit_urgency_name',
      120,
    ],
    ['crane_age_band_masters', 'age_band_code', 'age_band_name', 60],
    [
      'crane_visit_duration_masters',
      'visit_duration_code',
      'visit_duration_name',
      120,
    ],
    ['crane_visit_time_masters', 'visit_time_code', 'visit_time_name', 120],
    [
      'crane_access_approval_masters',
      'access_approval_code',
      'access_approval_name',
      150,
    ],
    [
      'crane_engineer_visa_masters',
      'engineer_visa_code',
      'engineer_visa_name',
      150,
    ],
    [
      'crane_ppe_provider_masters',
      'ppe_provider_code',
      'ppe_provider_name',
      120,
    ],
    ['crane_hot_work_masters', 'hot_work_code', 'hot_work_name', 120],
    ['crane_translator_masters', 'translator_code', 'translator_name', 120],
    [
      'crane_engagement_type_masters',
      'engagement_type_code',
      'engagement_type_name',
      150,
    ],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
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

    // Why the engineer is coming. Drives who gets assigned and whether the
    // visit is billable.
    await seed(
      'crane_visit_purpose_masters',
      'visit_purpose_code',
      'visit_purpose_name',
      [
        'Pre-quote technical assessment — scope to be confirmed on site',
        'Modernize-vs-replace evaluation — engineering ROI study',
        'Pre-contract fleet survey — multi-crane walk-down before engagement',
        'Post-incident inspection — forensic engineering visit',
        'Pre-purchase / acquisition due diligence',
        'Compliance gap audit — pre-statutory-inspection sweep',
        'Site survey for installation',
        'Problem diagnosis — something is wrong, need eyes on it',
        'Strategic supplier evaluation / capability discussion',
        'General engineering consultation',
      ],
    );

    // A separate scale from the quote form's urgency: this is about when an
    // engineer can attend, not how soon work must finish.
    await seed(
      'crane_visit_urgency_masters',
      'visit_urgency_code',
      'visit_urgency_name',
      [
        'This week — subject to availability',
        'Within 2 weeks',
        'Within 1 month',
        'Within 3 months / strategic planning',
        'Flexible — engineer to advise',
      ],
    );

    await seed('crane_age_band_masters', 'age_band_code', 'age_band_name', [
      'Under 5 years',
      '5 — 10 years',
      '10 — 20 years',
      '20+ years',
      'Mixed fleet',
      'Unknown',
    ]);

    await seed(
      'crane_visit_duration_masters',
      'visit_duration_code',
      'visit_duration_name',
      [
        '2 — 3 hours (focused inspection)',
        'Half day (single asset, deeper assessment)',
        'Full day (multi-asset or detailed investigation)',
        'Multi-day (full fleet survey or post-incident)',
        'Flexible — depends on findings',
      ],
    );

    await seed(
      'crane_visit_time_masters',
      'visit_time_code',
      'visit_time_name',
      [
        'Morning (07:00 — 12:00)',
        'Afternoon (13:00 — 17:00)',
        'Evening / shift change observation',
        'Night shift (24/7 operations)',
        'Weekend (Friday / Saturday)',
      ],
    );

    // Access is the single biggest driver of when an engineer can actually
    // stand in front of the crane.
    await seed(
      'crane_access_approval_masters',
      'access_approval_code',
      'access_approval_name',
      [
        'Already approved — engineer can attend',
        'In progress — sponsorship submitted',
        'Veltrixair to handle access process',
        'Not required — standard industrial site',
        'Unknown — please advise',
      ],
    );

    await seed(
      'crane_engineer_visa_masters',
      'engineer_visa_code',
      'engineer_visa_name',
      [
        'Not required — KSA-resident engineer fine',
        'Iqama / work permit required (visiting from elsewhere in KSA)',
        'Specialist visa (HCIS / restricted site)',
        "Don't know — please advise",
      ],
    );

    await seed(
      'crane_ppe_provider_masters',
      'ppe_provider_code',
      'ppe_provider_name',
      [
        'Client supplies (helmet, vest, boots, etc.)',
        'Engineer brings own PPE',
        'Mixed — confirm specifics',
      ],
    );

    await seed('crane_hot_work_masters', 'hot_work_code', 'hot_work_name', [
      'No — observation only',
      'Possible — depends on findings',
      'Yes — PTW preparation needed',
      'Confined space access required',
    ]);

    await seed(
      'crane_translator_masters',
      'translator_code',
      'translator_name',
      [
        'No — all parties speak English',
        'Arabic preferred',
        'Hindi / Urdu preferred',
        'Engineer to advise',
      ],
    );

    // Whether anyone is paying. "Most pre-quote visits are at no charge.
    // Standalone assessments and forensic visits are typically paid."
    await seed(
      'crane_engagement_type_masters',
      'engagement_type_code',
      'engagement_type_name',
      [
        'Pre-quote / part of proposal process (typically no charge)',
        'Paid engineering assessment / advisory',
        'Included in existing AMC scope',
        'Open to discussion',
      ],
    );

    // ------------------------------------------------------------ the visit

    await queryRunner.query(`
      CREATE TABLE "crane_site_visits" (
        "id"                       uuid NOT NULL DEFAULT gen_random_uuid(),
        "reference_no"             character varying(30) NOT NULL,
        "site_code"                integer NOT NULL,
        "quote_id"                 uuid,

        "visit_purpose_code"       integer NOT NULL,
        "service_line_code"        integer,
        "visit_urgency_code"       integer NOT NULL,
        "engineer_focus"           character varying(5000) NOT NULL,

        "company_name"             character varying(200) NOT NULL,
        "industry_code"            integer NOT NULL,
        "contact_name"             character varying(150) NOT NULL,
        "contact_position"         character varying(150),
        "business_email"           character varying(255) NOT NULL,
        "mobile"                   character varying(30) NOT NULL,
        "existing_client"          character varying(20) NOT NULL,
        "lead_source_code"         integer,

        "site_city_code"           integer NOT NULL,
        "site_access_code"         integer,
        "site_address"             character varying(500),
        "site_contact_name"        character varying(150),
        "site_contact_phone"       character varying(30),
        "crane_count"              integer,
        "crane_type_code"          integer,
        "oem_code"                 integer,
        "age_band_code"            integer,
        "environment_code"         integer,

        "preferred_dates"          character varying(300),
        "avoid_dates"              character varying(300),
        "visit_duration_code"      integer,
        "visit_time_code"          integer,
        "attendees"                character varying(2000),
        "agenda_items"             character varying(3000),

        "access_approval_code"     integer,
        "engineer_visa_code"       integer,
        "ppe_provider_code"        integer,
        "hot_work_code"            integer,
        "translator_code"          integer,
        "engagement_type_code"     integer,
        "site_constraints"         character varying(3000),

        "status"                   character varying(20) NOT NULL DEFAULT 'NEW',
        "assigned_engineer"        character varying(150),
        "scheduled_at"             timestamptz,
        "manage_token"             character varying(64) NOT NULL,

        "coordination_due_at"      timestamptz NOT NULL,
        "report_due_at"            timestamptz NOT NULL,
        "first_responded_at"       timestamptz,

        "consent_at"               timestamptz NOT NULL,
        "privacy_notice_version"   character varying(50) NOT NULL,
        "photography_consent"      boolean NOT NULL DEFAULT false,
        "marketing_opt_in"         boolean NOT NULL DEFAULT false,

        "source_page"              character varying(500),
        "ip_hash"                  character varying(64),
        "user_agent"               character varying(500),
        "spam_score"               integer NOT NULL DEFAULT 0,

        "is_deleted"               boolean NOT NULL DEFAULT false,
        "deleted_at"               timestamptz,
        "created_date"             timestamptz NOT NULL DEFAULT now(),
        "updated_date"             timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "vtx_crane_site_visits_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_crane_site_visits_reference_no_unique" UNIQUE ("reference_no"),
        CONSTRAINT "vtx_crane_site_visits_manage_token_unique" UNIQUE ("manage_token"),
        CONSTRAINT "vtx_crane_site_visits_existing_client_check"
          CHECK ("existing_client" IN ('NO','ACTIVE_AMC','PAST_PROJECTS','EVALUATING')),
        CONSTRAINT "vtx_crane_site_visits_status_check"
          CHECK ("status" IN ('NEW','COORDINATING','SCHEDULED','COMPLETED','REPORT_SENT','CANCELLED'))
      )
    `);

    const fks: [string, string, string, string][] = [
      ['site_code', 'site_masters', 'site_code', 'RESTRICT'],
      // A visit outlives the quote it was scoped from.
      ['quote_id', 'crane_quote_requests', 'id', 'SET NULL'],
      [
        'visit_purpose_code',
        'crane_visit_purpose_masters',
        'visit_purpose_code',
        'RESTRICT',
      ],
      [
        'service_line_code',
        'crane_service_line_masters',
        'service_line_code',
        'RESTRICT',
      ],
      [
        'visit_urgency_code',
        'crane_visit_urgency_masters',
        'visit_urgency_code',
        'RESTRICT',
      ],
      ['industry_code', 'industry_masters', 'industry_code', 'RESTRICT'],
      [
        'lead_source_code',
        'crane_lead_source_masters',
        'lead_source_code',
        'RESTRICT',
      ],
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
      ['age_band_code', 'crane_age_band_masters', 'age_band_code', 'RESTRICT'],
      [
        'environment_code',
        'crane_environment_masters',
        'environment_code',
        'RESTRICT',
      ],
      [
        'visit_duration_code',
        'crane_visit_duration_masters',
        'visit_duration_code',
        'RESTRICT',
      ],
      [
        'visit_time_code',
        'crane_visit_time_masters',
        'visit_time_code',
        'RESTRICT',
      ],
      [
        'access_approval_code',
        'crane_access_approval_masters',
        'access_approval_code',
        'RESTRICT',
      ],
      [
        'engineer_visa_code',
        'crane_engineer_visa_masters',
        'engineer_visa_code',
        'RESTRICT',
      ],
      [
        'ppe_provider_code',
        'crane_ppe_provider_masters',
        'ppe_provider_code',
        'RESTRICT',
      ],
      ['hot_work_code', 'crane_hot_work_masters', 'hot_work_code', 'RESTRICT'],
      [
        'translator_code',
        'crane_translator_masters',
        'translator_code',
        'RESTRICT',
      ],
      [
        'engagement_type_code',
        'crane_engagement_type_masters',
        'engagement_type_code',
        'RESTRICT',
      ],
    ];

    for (const [column, refTable, refColumn, onDelete] of fks) {
      await queryRunner.query(`
        ALTER TABLE "crane_site_visits"
          ADD CONSTRAINT "vtx_crane_site_visits_${column}_fk"
          FOREIGN KEY ("${column}") REFERENCES "${refTable}"("${refColumn}") ON DELETE ${onDelete}
      `);
    }

    await queryRunner.query(`
      CREATE TABLE "crane_site_visit_events" (
        "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
        "visit_id"     uuid NOT NULL,
        "event_type"   character varying(30) NOT NULL,
        "actor"        character varying(150),
        "note"         character varying(2000),
        "metadata"     jsonb,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_crane_site_visit_events_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_crane_site_visit_events_visit_id_fk"
          FOREIGN KEY ("visit_id") REFERENCES "crane_site_visits"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_crane_site_visit_events_event_type_check"
          CHECK ("event_type" IN ('CREATED','STATUS_CHANGED','ASSIGNED','SCHEDULED','NOTE_ADDED','NOTIFICATION_SENT'))
      )
    `);

    for (const [name, table, cols] of [
      [
        'idx_crane_site_visits_reference_no',
        'crane_site_visits',
        '"reference_no"',
      ],
      ['idx_crane_site_visits_site_code', 'crane_site_visits', '"site_code"'],
      ['idx_crane_site_visits_status', 'crane_site_visits', '"status"'],
      ['idx_crane_site_visits_city', 'crane_site_visits', '"site_city_code"'],
      [
        'idx_crane_site_visits_purpose',
        'crane_site_visits',
        '"visit_purpose_code"',
      ],
      ['idx_crane_site_visits_quote_id', 'crane_site_visits', '"quote_id"'],
      [
        'idx_crane_site_visit_events_visit_id',
        'crane_site_visit_events',
        '"visit_id"',
      ],
    ] as [string, string, string][]) {
      await queryRunner.query(`CREATE INDEX "${name}" ON "${table}" (${cols})`);
    }

    // The queue a coordinator watches: soonest wanted, still open.
    await queryRunner.query(`
      CREATE INDEX "idx_crane_site_visits_open_urgency"
        ON "crane_site_visits" ("visit_urgency_code", "coordination_due_at")
        WHERE "is_deleted" = false AND "status" IN ('NEW','COORDINATING','SCHEDULED')
    `);

    await queryRunner.query(
      `CREATE SEQUENCE "crane_site_visit_ref_seq" START WITH 1 INCREMENT BY 1`,
    );

    // ------------------------------------------------- feature 109 and grants

    await queryRunner.query(`
      INSERT INTO "feature_masters" ("feature_code", "feature_name", "description")
      VALUES (109, 'CRANE_SITE_VISITS', 'Site visit requests for Veltrixair Industries')
    `);

    // SUPER_ADMIN never inherits new features — it was seeded by a CROSS JOIN
    // over the features that existed then, so every addition needs this line.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      SELECT 101, 109, p."permission_code" FROM "permission_masters" p
    `);

    // Same holders as the quote pipeline today. Kept as its own feature because
    // the page describes visits as engineer-led and quotes as sales-led — if
    // that split ever becomes real, it costs nothing to separate them.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      SELECT 104, 109, p."permission_code" FROM "permission_masters" p
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      VALUES (105, 109, 101)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "feature_code" = 109`,
    );
    await queryRunner.query(
      `DELETE FROM "feature_masters" WHERE "feature_code" = 109`,
    );
    await queryRunner.query(
      `DROP SEQUENCE IF EXISTS "crane_site_visit_ref_seq"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "crane_site_visit_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crane_site_visits"`);

    for (const [table] of this.masters) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
