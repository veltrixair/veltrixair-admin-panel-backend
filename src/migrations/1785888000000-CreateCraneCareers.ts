import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Careers for veltrixairindustries.com — postings and applications.
 *
 * Its own tables rather than the IT ones, because the two forms share about
 * four fields. Crane asks for nationality, KSA residency status and working
 * languages, measures experience in bands rather than years, does not ask for
 * salary at all, and does not take a CV at submit. Bending `job_applications`
 * to fit would mean a table where most columns are null for whichever brand you
 * are looking at, and a null that cannot tell you whether the candidate skipped
 * the question or their brand never asked it.
 *
 * Two features, not one: 111 governs the adverts, 112 governs the candidates.
 * A crane application carries nationality and residency status — close to
 * protected-characteristic territory, and commercially sensitive under Nitaqat
 * — so publishing a vacancy and reading applicants must be separately
 * grantable, the same way IT_CAREERS and IT_APPLICATIONS already are.
 */
export class CreateCraneCareers1785888000000 implements MigrationInterface {
  name = 'CreateCraneCareers1785888000000';

  /** Every new master takes the same shape; only its code column differs. */
  private readonly masters: [
    table: string,
    codeColumn: string,
    nameColumn: string,
  ][] = [
    ['crane_career_track_masters', 'track_code', 'track_name'],
    ['crane_experience_band_masters', 'band_code', 'band_name'],
    ['crane_residency_status_masters', 'residency_code', 'residency_name'],
    ['crane_availability_masters', 'availability_code', 'availability_name'],
    [
      'crane_career_qualification_masters',
      'qualification_code',
      'qualification_name',
    ],
    ['crane_job_location_masters', 'location_code', 'location_name'],
    [
      'crane_employment_type_masters',
      'employment_type_code',
      'employment_type_name',
    ],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, codeColumn, nameColumn] of this.masters) {
      await queryRunner.query(`
        CREATE TABLE "${table}" (
          "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
          "site_code"     integer NOT NULL DEFAULT 102,
          "${codeColumn}" integer NOT NULL,
          "${nameColumn}" character varying(150) NOT NULL,
          "display_order" integer NOT NULL DEFAULT 0,
          "is_active"     boolean NOT NULL DEFAULT true,
          "is_deleted"    boolean NOT NULL DEFAULT false,
          "deleted_at"    timestamptz,
          "created_date"  timestamptz NOT NULL DEFAULT now(),
          "updated_date"  timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT "vtx_${table}_id_pk" PRIMARY KEY ("id"),
          CONSTRAINT "vtx_${table}_code_uq" UNIQUE ("${codeColumn}"),
          CONSTRAINT "vtx_${table}_site_code_fk"
            FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT
        )
      `);
    }

    // The catalogue number the public site prints beside a discipline —
    // "VTX-CRN-01". It belongs on the service line rather than repeated on
    // every posting, and the quote form can show it too.
    await queryRunner.query(`
      ALTER TABLE "crane_service_line_masters"
        ADD COLUMN "public_code" character varying(20)
    `);
    for (const [code, publicCode] of [
      [101, 'VTX-CRN-01'],
      [102, 'VTX-CRN-02'],
      [103, 'VTX-CRN-03'],
      [104, 'VTX-CRN-04'],
      [105, 'VTX-CRN-06'],
      [106, 'VTX-CRN-09'],
    ]) {
      await queryRunner.query(
        `UPDATE "crane_service_line_masters" SET "public_code" = $1 WHERE "service_line_code" = $2`,
        [publicCode, code],
      );
    }

    // ------------------------------------------------------------- seeds ---
    await queryRunner.query(`
      INSERT INTO "crane_career_track_masters" ("track_code","track_name","display_order") VALUES
        (201, 'Track 01 / Engineering — Installation & Field', 1),
        (202, 'Track 02 / Inspections', 2),
        (203, 'Track 03 / Emergency Response', 3),
        (204, 'Track 04 / Commercial & Governance', 4),
        (205, 'GET — Graduate Engineering Trainee 2026', 5),
        (206, 'General application — keep on file', 6)
    `);

    await queryRunner.query(`
      INSERT INTO "crane_experience_band_masters" ("band_code","band_name","display_order") VALUES
        (201, 'Fresh graduate / GET', 1),
        (202, '0–2 years', 2),
        (203, '3–5 years', 3),
        (204, '6–10 years', 4),
        (205, '10–15 years', 5),
        (206, '15+ years', 6)
    `);

    // The Nitaqat-relevant answer. Stored as given — nothing is inferred from
    // it, and nothing is rejected because of it.
    await queryRunner.query(`
      INSERT INTO "crane_residency_status_masters" ("residency_code","residency_name","display_order") VALUES
        (201, 'Saudi national', 1),
        (202, 'Iqama — active resident', 2),
        (203, 'Iqama — transferable', 3),
        (204, 'On visit visa', 4),
        (205, 'Abroad — willing to relocate', 5),
        (206, 'Not applicable', 6)
    `);

    await queryRunner.query(`
      INSERT INTO "crane_availability_masters" ("availability_code","availability_name","display_order") VALUES
        (201, 'Immediate', 1),
        (202, 'Within 2 weeks', 2),
        (203, 'Within 1 month', 3),
        (204, '2–3 months', 4),
        (205, 'Flexible', 5)
    `);

    // Its own list rather than the IT one: crane hires from trades, so
    // Diploma/ITI and "Other / Trade" are real answers here and absent there.
    await queryRunner.query(`
      INSERT INTO "crane_career_qualification_masters" ("qualification_code","qualification_name","display_order") VALUES
        (201, 'Diploma / ITI', 1),
        (202, 'Bachelor''s — Engineering', 2),
        (203, 'Bachelor''s — Other', 3),
        (204, 'Master''s — Engineering / MBA', 4),
        (205, 'PhD', 5),
        (206, 'Other / Trade certification', 6)
    `);

    await queryRunner.query(`
      INSERT INTO "crane_job_location_masters" ("location_code","location_name","display_order") VALUES
        (201, 'Riyadh', 1),
        (202, 'Jubail', 2),
        (203, 'Eastern Province', 3),
        (204, 'Multi-site — nationwide KSA', 4)
    `);

    await queryRunner.query(`
      INSERT INTO "crane_employment_type_masters" ("employment_type_code","employment_type_name","display_order") VALUES
        (201, 'Iqama-resident', 1),
        (202, 'On-call', 2),
        (203, 'Shift roster', 3)
    `);

    // ---------------------------------------------------------- postings ---
    await queryRunner.query(`
      CREATE TABLE "crane_job_postings" (
        "id"                   uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_code"            integer NOT NULL DEFAULT 102,
        "ref_code"             character varying(20) NOT NULL,
        "slug"                 character varying(200) NOT NULL,
        "title"                character varying(200) NOT NULL,

        "track_code"           integer NOT NULL,
        -- Null for the roles that sit outside the service catalogue: the sales
        -- executive, the HSE coordinator, the graduate programme.
        "service_line_code"    integer,
        "location_code"        integer NOT NULL,
        "employment_type_code" integer NOT NULL,
        "experience_band_code" integer,

        "summary"              character varying(500),
        "description_mdx"      text,
        "responsibilities"     text[] NOT NULL DEFAULT '{}',
        "requirements"         text[] NOT NULL DEFAULT '{}',
        -- "ISO 9927", "NDT Level II". Free text because a ticket is whatever
        -- the awarding body calls it, and a master would go stale.
        "certifications"       text[] NOT NULL DEFAULT '{}',

        -- Shown on the advert, never enforced at submit: refusing an applicant
        -- by nationality is a legal question, not a technical one.
        "saudi_nationals_only" boolean NOT NULL DEFAULT false,
        "openings"             integer NOT NULL DEFAULT 1,

        "status"               character varying(20) NOT NULL DEFAULT 'DRAFT',
        "display_order"        integer NOT NULL DEFAULT 0,
        "seo_title"            character varying(200),
        "seo_description"      character varying(400),
        "posted_at"            timestamptz,
        "closes_at"            timestamptz,

        "is_deleted"           boolean NOT NULL DEFAULT false,
        "deleted_at"           timestamptz,
        "created_date"         timestamptz NOT NULL DEFAULT now(),
        "updated_date"         timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "vtx_crane_job_postings_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_crane_job_postings_slug_uq" UNIQUE ("slug"),
        CONSTRAINT "vtx_crane_job_postings_ref_code_uq" UNIQUE ("ref_code"),
        CONSTRAINT "vtx_crane_job_postings_site_code_fk"
          FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_job_postings_track_code_fk"
          FOREIGN KEY ("track_code") REFERENCES "crane_career_track_masters"("track_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_job_postings_service_line_code_fk"
          FOREIGN KEY ("service_line_code") REFERENCES "crane_service_line_masters"("service_line_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_job_postings_location_code_fk"
          FOREIGN KEY ("location_code") REFERENCES "crane_job_location_masters"("location_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_job_postings_employment_type_code_fk"
          FOREIGN KEY ("employment_type_code") REFERENCES "crane_employment_type_masters"("employment_type_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_job_postings_experience_band_code_fk"
          FOREIGN KEY ("experience_band_code") REFERENCES "crane_experience_band_masters"("band_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_job_postings_status_check"
          CHECK ("status" IN ('DRAFT','OPEN','CLOSED'))
      )
    `);

    // ------------------------------------------------------ applications ---
    // No CV column at submit. The page tells candidates to reply to the
    // acknowledgement with their CV attached, so `cv_file_id` is filled in
    // later by whoever handles that reply — see the attach route. Until then a
    // CV lives in an inbox, which is precisely why the column exists: PDPL
    // retention can only delete what the record knows about.
    await queryRunner.query(`
      CREATE TABLE "crane_applications" (
        "id"                   uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_code"            integer NOT NULL DEFAULT 102,
        "reference_no"         character varying(30) NOT NULL,

        -- Section 01
        "track_code"           integer NOT NULL,
        "job_id"               uuid,
        "experience_band_code" integer NOT NULL,
        "availability_code"    integer,

        -- Section 02
        "full_name"            character varying(150) NOT NULL,
        "nationality"          character varying(100) NOT NULL,
        "email"                character varying(255) NOT NULL,
        "mobile"               character varying(32) NOT NULL,
        "current_location"     character varying(150),
        "residency_code"       integer NOT NULL,

        -- Section 03
        "qualification_code"   integer NOT NULL,
        "working_languages"    text[] NOT NULL,
        "certifications"       character varying(500),
        "background_summary"   text NOT NULL,

        -- Handled after the acknowledgement
        "cv_file_id"           uuid,
        "cv_attached_at"       timestamptz,

        -- Pipeline. Each stage carries the due date the page publishes.
        "status"               character varying(24) NOT NULL DEFAULT 'SUBMITTED',
        "acknowledged_at"      timestamptz,
        "stage_due_at"         timestamptz,
        "assigned_to"          character varying(150),
        "assigned_at"          timestamptz,

        "consent_at"           timestamptz NOT NULL,
        "privacy_notice_version" character varying(50) NOT NULL,
        "retention_until"      timestamptz NOT NULL,

        "source_page"          character varying(500),
        "ip_hash"              character varying(64),
        "user_agent"           character varying(500),
        "spam_score"           integer NOT NULL DEFAULT 0,

        "is_deleted"           boolean NOT NULL DEFAULT false,
        "deleted_at"           timestamptz,
        "created_date"         timestamptz NOT NULL DEFAULT now(),
        "updated_date"         timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "vtx_crane_applications_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_crane_applications_reference_no_uq" UNIQUE ("reference_no"),
        CONSTRAINT "vtx_crane_applications_site_code_fk"
          FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_applications_track_code_fk"
          FOREIGN KEY ("track_code") REFERENCES "crane_career_track_masters"("track_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_applications_job_id_fk"
          FOREIGN KEY ("job_id") REFERENCES "crane_job_postings"("id") ON DELETE SET NULL,
        CONSTRAINT "vtx_crane_applications_experience_band_code_fk"
          FOREIGN KEY ("experience_band_code") REFERENCES "crane_experience_band_masters"("band_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_applications_availability_code_fk"
          FOREIGN KEY ("availability_code") REFERENCES "crane_availability_masters"("availability_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_applications_residency_code_fk"
          FOREIGN KEY ("residency_code") REFERENCES "crane_residency_status_masters"("residency_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_applications_qualification_code_fk"
          FOREIGN KEY ("qualification_code") REFERENCES "crane_career_qualification_masters"("qualification_code") ON DELETE RESTRICT,
        CONSTRAINT "vtx_crane_applications_cv_file_id_fk"
          FOREIGN KEY ("cv_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL,
        CONSTRAINT "vtx_crane_applications_status_check"
          CHECK ("status" IN ('SUBMITTED','SCREENING','TECHNICAL_INTERVIEW','FINAL_INTERVIEW','OFFER','HIRED','REJECTED','WITHDRAWN')),
        -- A CV and the moment it arrived move together, so "how long have we
        -- had this CV" can never read as null on a record that has one.
        CONSTRAINT "vtx_crane_applications_cv_check"
          CHECK (("cv_file_id" IS NULL) = ("cv_attached_at" IS NULL)),
        CONSTRAINT "vtx_crane_applications_assigned_check"
          CHECK (("assigned_to" IS NULL) = ("assigned_at" IS NULL))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "crane_application_events" (
        "id"             uuid NOT NULL DEFAULT gen_random_uuid(),
        "application_id" uuid NOT NULL,
        "event_type"     character varying(30) NOT NULL,
        "actor"          character varying(150),
        "note"           character varying(2000),
        "metadata"       jsonb,
        "created_date"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_crane_application_events_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_crane_application_events_application_id_fk"
          FOREIGN KEY ("application_id") REFERENCES "crane_applications"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_crane_application_events_event_type_check"
          CHECK ("event_type" IN ('CREATED','ACKNOWLEDGED','STAGE_CHANGED','CV_ATTACHED','ASSIGNED','UNASSIGNED','NOTE_ADDED','WITHDRAWN','NOTIFICATION_SENT'))
      )
    `);

    for (const [name, table, columns] of [
      ['idx_crane_job_postings_status', 'crane_job_postings', '"status"'],
      ['idx_crane_job_postings_track', 'crane_job_postings', '"track_code"'],
      ['idx_crane_applications_status', 'crane_applications', '"status"'],
      ['idx_crane_applications_track', 'crane_applications', '"track_code"'],
      ['idx_crane_applications_email', 'crane_applications', '"email"'],
      ['idx_crane_applications_job', 'crane_applications', '"job_id"'],
      [
        'idx_crane_application_events_app',
        'crane_application_events',
        '"application_id"',
      ],
    ]) {
      await queryRunner.query(
        `CREATE INDEX "${name}" ON "${table}" (${columns})`,
      );
    }

    await queryRunner.query(
      `CREATE SEQUENCE "crane_application_ref_seq" START WITH 1 INCREMENT BY 1`,
    );

    // ------------------------------------------- features 111 and 112 ------
    await queryRunner.query(`
      INSERT INTO "feature_masters" ("feature_code","feature_name","description") VALUES
        (111, 'CRANE_CAREERS', 'Job postings for Veltrixair Industries'),
        (112, 'CRANE_APPLICATIONS', 'Crane candidates — nationality, residency and background')
    `);

    // SUPER_ADMIN was seeded by a CROSS JOIN over the features that existed
    // then, so every addition needs saying explicitly.
    for (const feature of [111, 112]) {
      await queryRunner.query(
        `INSERT INTO "role_permissions" ("role_code","feature_code","permission_code")
         SELECT 101, $1, p."permission_code" FROM "permission_masters" p`,
        [feature],
      );
    }

    // RECRUITER gets both, mirroring how it holds IT_CAREERS and
    // IT_APPLICATIONS. VIEWER sees the adverts but NOT the candidates — the
    // whole point of splitting the two features.
    for (const feature of [111, 112]) {
      await queryRunner.query(
        `INSERT INTO "role_permissions" ("role_code","feature_code","permission_code")
         SELECT 103, $1, p."permission_code" FROM "permission_masters" p`,
        [feature],
      );
    }
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_code","feature_code","permission_code") VALUES (105, 111, 101)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "feature_code" IN (111, 112)`,
    );
    await queryRunner.query(
      `DELETE FROM "feature_masters" WHERE "feature_code" IN (111, 112)`,
    );
    await queryRunner.query(
      `DROP SEQUENCE IF EXISTS "crane_application_ref_seq"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "crane_application_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crane_applications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crane_job_postings"`);
    await queryRunner.query(
      `ALTER TABLE "crane_service_line_masters" DROP COLUMN IF EXISTS "public_code"`,
    );
    for (const [table] of this.masters) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
