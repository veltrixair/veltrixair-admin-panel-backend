import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Job applications — careers Scope B.
 *
 * The résumé policy has been sitting in the files module unused since it was
 * built: FilePurpose.RESUME, 5 MB cap, pdf/doc/docx, 12-month retention. This
 * is what finally reaches it.
 *
 * APPLICATIONS is its own feature code rather than riding on CAREERS. That is
 * not tidiness — CONTENT_EDITOR holds CAREERS:VIEW so it can reword job adverts,
 * and VIEWER holds it too. Folding applications into CAREERS would hand both of
 * them every candidate's phone number, salary expectation and CV. Splitting the
 * codes makes "manage job adverts" and "read candidate PII" separately
 * grantable, which is the same reason FILES is not part of INSIGHTS.
 */
export class CreateApplicationsModule1785841200000 implements MigrationInterface {
  name = 'CreateApplicationsModule1785841200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------- masters

    const masters: [string, string, string, number][] = [
      [
        'qualification_masters',
        'qualification_code',
        'qualification_name',
        100,
      ],
      [
        'notice_period_masters',
        'notice_period_code',
        'notice_period_name',
        100,
      ],
      ['application_source_masters', 'source_code', 'source_name', 100],
      [
        'work_authorisation_masters',
        'work_authorisation_code',
        'work_authorisation_name',
        120,
      ],
    ];

    for (const [table, codeCol, nameCol, len] of masters) {
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

    await queryRunner.query(`
      INSERT INTO "qualification_masters" ("qualification_code", "qualification_name", "display_order") VALUES
        (101, 'High School',                 1),
        (102, 'Diploma',                     2),
        (103, 'Bachelor''s Degree',          3),
        (104, 'Master''s Degree',            4),
        (105, 'Doctorate',                   5),
        (106, 'Professional Certification',  6)
    `);

    await queryRunner.query(`
      INSERT INTO "notice_period_masters" ("notice_period_code", "notice_period_name", "display_order") VALUES
        (101, 'Immediately available', 1),
        (102, '15 days',               2),
        (103, '30 days',               3),
        (104, '60 days',               4),
        (105, '90 days',               5)
    `);

    await queryRunner.query(`
      INSERT INTO "application_source_masters" ("source_code", "source_name", "display_order") VALUES
        (101, 'Veltrixair website', 1),
        (102, 'LinkedIn',           2),
        (103, 'Referral',           3),
        (104, 'Job board',          4),
        (105, 'Recruiter',          5),
        (106, 'Other',              6)
    `);

    // Deliberately phrased by status rather than by nationality. What a
    // recruiter needs to know is whether a visa is required, not where someone
    // is from — and the narrower question is the one that stays lawful to ask
    // across all three jurisdictions.
    await queryRunner.query(`
      INSERT INTO "work_authorisation_masters" ("work_authorisation_code", "work_authorisation_name", "display_order") VALUES
        (101, 'Citizen or permanent resident',        1),
        (102, 'Valid work visa — transferable',       2),
        (103, 'Valid work visa — not transferable',   3),
        (104, 'Requires sponsorship',                 4)
    `);

    // ----------------------------------------------------------- applications

    await queryRunner.query(`
      CREATE TABLE "job_applications" (
        "id"                       uuid NOT NULL DEFAULT gen_random_uuid(),
        "reference_no"             character varying(30) NOT NULL,
        "job_id"                   uuid,
        "first_name"               character varying(100) NOT NULL,
        "last_name"                character varying(100) NOT NULL,
        "email"                    character varying(255) NOT NULL,
        "phone"                    character varying(30) NOT NULL,
        "current_title"            character varying(150) NOT NULL,
        "qualification_code"       integer NOT NULL,
        "experience_years"         numeric(4,1) NOT NULL,
        "linkedin_url"             character varying(300),
        "city"                     character varying(100) NOT NULL,
        "country_code"             integer NOT NULL,
        "notice_period_code"       integer NOT NULL,
        "work_authorisation_code"  integer NOT NULL,
        "expected_salary"          numeric(12,2),
        "salary_currency"          character(3),
        "resume_file_id"           uuid,
        "cover_note"               character varying(4000),
        "source_code"              integer,
        "status"                   character varying(20) NOT NULL DEFAULT 'NEW',
        "assigned_to"              character varying(150),
        "manage_token"             character varying(64) NOT NULL,
        "withdrawn_at"             timestamptz,
        "consent_at"               timestamptz NOT NULL,
        "privacy_notice_version"   character varying(50) NOT NULL,
        "source_page"              character varying(500),
        "ip_hash"                  character varying(64),
        "user_agent"               character varying(500),
        "spam_score"               integer NOT NULL DEFAULT 0,
        "is_deleted"               boolean NOT NULL DEFAULT false,
        "deleted_at"               timestamptz,
        "created_date"             timestamptz NOT NULL DEFAULT now(),
        "updated_date"             timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_job_applications_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_job_applications_reference_no_unique" UNIQUE ("reference_no"),
        CONSTRAINT "vtx_job_applications_manage_token_unique" UNIQUE ("manage_token"),
        CONSTRAINT "vtx_job_applications_experience_years_check"
          CHECK ("experience_years" >= 0 AND "experience_years" <= 60),
        CONSTRAINT "vtx_job_applications_status_check"
          CHECK ("status" IN ('NEW','SCREENING','SHORTLISTED','INTERVIEW','OFFER','HIRED','REJECTED','WITHDRAWN'))
      )
    `);

    // SET NULL on the job: closing a role must never be blocked by, or destroy,
    // the applications made to it. SET NULL on the résumé for the same reason —
    // an erasure request deletes the file and leaves the record standing.
    const fks: [string, string, string, string, string][] = [
      [
        'job_id',
        'job_postings',
        'id',
        'SET NULL',
        'vtx_job_applications_job_id_fk',
      ],
      [
        'resume_file_id',
        'stored_files',
        'id',
        'SET NULL',
        'vtx_job_applications_resume_file_id_fk',
      ],
      [
        'qualification_code',
        'qualification_masters',
        'qualification_code',
        'RESTRICT',
        'vtx_job_applications_qualification_code_fk',
      ],
      [
        'country_code',
        'country_masters',
        'country_code',
        'RESTRICT',
        'vtx_job_applications_country_code_fk',
      ],
      [
        'notice_period_code',
        'notice_period_masters',
        'notice_period_code',
        'RESTRICT',
        'vtx_job_applications_notice_period_code_fk',
      ],
      [
        'work_authorisation_code',
        'work_authorisation_masters',
        'work_authorisation_code',
        'RESTRICT',
        'vtx_job_applications_work_authorisation_code_fk',
      ],
      [
        'source_code',
        'application_source_masters',
        'source_code',
        'RESTRICT',
        'vtx_job_applications_source_code_fk',
      ],
    ];

    for (const [column, refTable, refColumn, onDelete, name] of fks) {
      await queryRunner.query(`
        ALTER TABLE "job_applications"
          ADD CONSTRAINT "${name}"
          FOREIGN KEY ("${column}") REFERENCES "${refTable}"("${refColumn}") ON DELETE ${onDelete}
      `);
    }

    await queryRunner.query(`
      CREATE TABLE "job_application_events" (
        "id"             uuid NOT NULL DEFAULT gen_random_uuid(),
        "application_id" uuid NOT NULL,
        "event_type"     character varying(30) NOT NULL,
        "actor"          character varying(150),
        "note"           character varying(2000),
        "metadata"       jsonb,
        "created_date"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_job_application_events_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_job_application_events_event_type_check"
          CHECK ("event_type" IN ('CREATED','STATUS_CHANGED','ASSIGNED','NOTE_ADDED','RESUME_VIEWED','WITHDRAWN','NOTIFICATION_SENT'))
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "job_application_events"
        ADD CONSTRAINT "vtx_job_application_events_application_id_fk"
        FOREIGN KEY ("application_id") REFERENCES "job_applications"("id") ON DELETE CASCADE
    `);

    for (const [name, table, cols] of [
      [
        'idx_job_applications_reference_no',
        'job_applications',
        '"reference_no"',
      ],
      ['idx_job_applications_job_id', 'job_applications', '"job_id"'],
      ['idx_job_applications_email', 'job_applications', '"email"'],
      ['idx_job_applications_status', 'job_applications', '"status"'],
      [
        'idx_job_application_events_application_id',
        'job_application_events',
        '"application_id"',
      ],
    ] as [string, string, string][]) {
      await queryRunner.query(`CREATE INDEX "${name}" ON "${table}" (${cols})`);
    }

    // The duplicate-application check runs on every submission.
    await queryRunner.query(`
      CREATE INDEX "idx_job_applications_email_job_live"
        ON "job_applications" ("email", "job_id")
        WHERE "is_deleted" = false AND "status" NOT IN ('REJECTED','WITHDRAWN')
    `);

    // ------------------------------------------------- feature 107 and grants

    await queryRunner.query(`
      INSERT INTO "feature_masters" ("feature_code", "feature_name", "description")
      VALUES (107, 'APPLICATIONS', 'Job applications, candidate details and résumés')
    `);

    // SUPER_ADMIN was seeded by a CROSS JOIN over the features that existed at
    // the time, so it does NOT pick up new ones. Every new feature needs this
    // line, or the super admin gets a 403 on a surface it should own.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      SELECT 101, 107, p."permission_code" FROM "permission_masters" p
    `);

    // RECRUITER owns the hiring pipeline end to end.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code", "feature_code", "permission_code")
      SELECT 103, 107, p."permission_code" FROM "permission_masters" p
    `);

    // Deliberately nothing for CONTENT_EDITOR, SALES or VIEWER. A CV is not
    // something to hand out because someone happens to have admin access.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "feature_code" = 107`,
    );
    await queryRunner.query(
      `DELETE FROM "feature_masters" WHERE "feature_code" = 107`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "job_application_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "job_applications"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "work_authorisation_masters"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "application_source_masters"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notice_period_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "qualification_masters"`);
  }
}
