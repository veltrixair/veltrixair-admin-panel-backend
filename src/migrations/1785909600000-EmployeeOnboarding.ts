import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Employees become the person of record; accounts become a grant of access.
 *
 * Until now an employment record could only exist attached to a login:
 * `admin_profiles.admin_id` was NOT NULL and UNIQUE, so onboarding somebody who
 * never opens the panel — a field engineer, a finance clerk — meant minting
 * them credentials they would never use.
 *
 * `admin_profiles` already said the right thing in its own comment: a profile
 * "belongs to the person", which is why it deliberately carried no `site_code`.
 * This finishes that thought. The person moves to `employees`, and `admins`
 * gains a nullable `employee_id` pointing at them. Nullable for exactly one
 * reason: the four service accounts (admin@, it.admin@, crane.admin@,
 * privacy.admin@) are credentials, not people, and have no HR file.
 *
 * Two tables follow the person rather than the account — documents and
 * payslips — because they outlive any particular login and are read by HR, who
 * may not administer anything at all.
 *
 * Departments are replaced with the eight the panel actually offers. The old
 * nine described org functions; the new eight are the service practices the
 * business is organised around. Only two old codes were in use, and both are
 * remapped rather than dropped.
 */
export class EmployeeOnboarding1785909600000 implements MigrationInterface {
  name = 'EmployeeOnboarding1785909600000';

  /** Credentials, not people. Excluded from the backfill by address. */
  private static readonly SERVICE_ACCOUNTS = [
    'admin@veltrixair.com',
    'it.admin@veltrixair.com',
    'crane.admin@veltrixair.com',
    'privacy.admin@veltrixair.com',
  ];

  /** Probes from earlier testing. Accounts left alone; no HR file created. */
  private static readonly TEST_ACCOUNTS = [
    'fe.probe@example.com',
    'pending-probe@example.com',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const excluded = [
      ...EmployeeOnboarding1785909600000.SERVICE_ACCOUNTS,
      ...EmployeeOnboarding1785909600000.TEST_ACCOUNTS,
    ]
      .map((e) => `'${e}'`)
      .join(',');

    // --- the person -------------------------------------------------------
    //
    // `old_department_code` is a scaffold. The eight new departments reuse the
    // codes 101-108 that the old nine occupy, and old 103 (Sales) collides
    // with new 103 (Cybersecurity & Compliance) — so the original code is
    // parked here, the department table is swapped underneath, and the
    // remapping happens afterwards against a table that cannot be misread.
    await queryRunner.query(`
      CREATE TABLE "employees" (
        "id"                 uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employee_code"      varchar(30)  NOT NULL,
        "full_name"          varchar(150) NOT NULL,
        "work_email"         varchar(255) NOT NULL,
        "personal_email"     varchar(255),
        "mobile"             varchar(32),
        "designation"        varchar(150) NOT NULL,
        "department_code"    int          NOT NULL,
        "old_department_code" int,
        "employment_type"    varchar(20)  NOT NULL,
        "work_mode"          varchar(10)  NOT NULL DEFAULT 'ONSITE',
        "office_code"        int,
        "joining_date"       date,
        "reporting_to"       uuid,
        "monthly_net_pay"    numeric(12,2),
        "is_active"          boolean NOT NULL DEFAULT true,
        "is_deleted"         boolean NOT NULL DEFAULT false,
        "deleted_at"         timestamptz,
        "created_date"       timestamptz NOT NULL DEFAULT now(),
        "updated_date"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_employees_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_employees_employee_code_unique" UNIQUE ("employee_code"),
        CONSTRAINT "vtx_employees_work_email_unique" UNIQUE ("work_email"),
        CONSTRAINT "vtx_employees_employment_type_check"
          CHECK ("employment_type" IN ('FULL_TIME','PART_TIME','CONTRACT','INTERN')),
        CONSTRAINT "vtx_employees_work_mode_check"
          CHECK ("work_mode" IN ('REMOTE','ONSITE','HYBRID')),
        CONSTRAINT "vtx_employees_reporting_to_fk"
          FOREIGN KEY ("reporting_to") REFERENCES "employees"("id") ON DELETE SET NULL
      )
    `);

    // Everyone who is a person. Their employment record moves across intact,
    // keeping the employee code already issued to them.
    await queryRunner.query(`
      INSERT INTO "employees"
        ("employee_code","full_name","work_email","mobile","designation",
         "department_code","old_department_code","employment_type","office_code",
         "joining_date","is_active")
      SELECT p."employee_code", a."full_name", a."email", p."mobile", p."designation",
             1, p."department_code",
             CASE WHEN p."employment_type" = 'CONSULTANT' THEN 'CONTRACT'
                  ELSE p."employment_type" END,
             p."office_code", p."joining_date", a."is_active"
      FROM "admin_profiles" p
      JOIN "admins" a ON a."id" = p."admin_id"
      WHERE a."email" NOT IN (${excluded})
    `);

    // --- the account points at the person ---------------------------------
    await queryRunner.query(`
      ALTER TABLE "admins" ADD COLUMN "employee_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "admins"
        ADD CONSTRAINT "vtx_admins_employee_id_fk"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "admins"."employee_id" IS
        'The person this login belongs to. NULL only for service accounts, which are credentials rather than people.'
    `);
    await queryRunner.query(`
      UPDATE "admins" a
      SET "employee_id" = e."id"
      FROM "employees" e
      JOIN "admin_profiles" p ON p."employee_code" = e."employee_code"
      WHERE p."admin_id" = a."id"
    `);

    // Reporting lines were admin-to-admin; they are person-to-person now.
    await queryRunner.query(`
      UPDATE "employees" e
      SET "reporting_to" = mgr."employee_id"
      FROM "admin_profiles" p
      JOIN "admins" mgr ON mgr."id" = p."reporting_to"
      WHERE p."employee_code" = e."employee_code" AND mgr."employee_id" IS NOT NULL
    `);

    // --- the employment record has moved; the old table goes --------------
    await queryRunner.query(`DROP TABLE "admin_profiles"`);

    // --- departments: the panel's eight, replacing the old nine -----------
    await queryRunner.query(`DELETE FROM "department_masters"`);
    await queryRunner.query(`
      INSERT INTO "department_masters" ("department_code","department_name","display_order")
      VALUES
        (101,'Custom Software',1),
        (102,'Platform Engineering',2),
        (103,'Cybersecurity & Compliance',3),
        (104,'Digital & Growth',4),
        (105,'Managed IT',5),
        (106,'Business Applications',6),
        (107,'HR & Operations',7),
        (108,'Sales',8)
    `);

    // Old 103 Sales → new 108 Sales. Old 109 IT Support → 105 Managed IT, the
    // nearest of the eight; HR can correct individuals afterwards.
    await queryRunner.query(`
      UPDATE "employees"
      SET "department_code" = CASE "old_department_code"
        WHEN 103 THEN 108
        WHEN 109 THEN 105
        ELSE 105
      END
    `);
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "old_department_code"`);
    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD CONSTRAINT "vtx_employees_department_code_fk"
        FOREIGN KEY ("department_code") REFERENCES "department_masters"("department_code")
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_employees_department_code" ON "employees" ("department_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_employees_reporting_to" ON "employees" ("reporting_to")`,
    );

    // --- documents --------------------------------------------------------
    //
    // One row per employee per document type, created empty at MISSING so the
    // eight always exist and the screen never has to invent absent ones.
    await queryRunner.query(`
      CREATE TABLE "employee_documents" (
        "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employee_id" uuid NOT NULL,
        "doc_type"    varchar(20) NOT NULL,
        "file_id"     uuid,
        "status"      varchar(10) NOT NULL DEFAULT 'MISSING',
        "verified_at" timestamptz,
        "verified_by" varchar(255),
        "created_date" timestamptz NOT NULL DEFAULT now(),
        "updated_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_employee_documents_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_employee_documents_unique" UNIQUE ("employee_id","doc_type"),
        CONSTRAINT "vtx_employee_documents_type_check"
          CHECK ("doc_type" IN ('CV','EDUCATION','EXPERIENCE','OFFER',
                                'AADHAAR','PAN','PHOTO','BANK')),
        CONSTRAINT "vtx_employee_documents_status_check"
          CHECK ("status" IN ('VERIFIED','PENDING','MISSING')),
        CONSTRAINT "vtx_employee_documents_employee_id_fk"
          FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_employee_documents_file_id_fk"
          FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL
      )
    `);

    // --- payslips ---------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "employee_payslips" (
        "id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employee_id"  uuid NOT NULL,
        "period_month" date NOT NULL,
        "file_id"      uuid,
        "net_pay"      numeric(12,2),
        "issued_at"    timestamptz NOT NULL DEFAULT now(),
        "created_date" timestamptz NOT NULL DEFAULT now(),
        "updated_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_employee_payslips_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_employee_payslips_unique" UNIQUE ("employee_id","period_month"),
        CONSTRAINT "vtx_employee_payslips_employee_id_fk"
          FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "vtx_employee_payslips_file_id_fk"
          FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL
      )
    `);

    // --- file purposes ----------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "stored_files" DROP CONSTRAINT IF EXISTS "vtx_stored_files_purpose_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "stored_files" ADD CONSTRAINT "vtx_stored_files_purpose_check"
        CHECK ("purpose" IN ('WHITEPAPER','CAPABILITY_STATEMENT','RESUME',
                             'QUOTE_ATTACHMENT','CERTIFICATE',
                             'EMPLOYEE_DOCUMENT','EMPLOYEE_PAYSLIP'))
    `);

    // --- permission -------------------------------------------------------
    //
    // Its own feature, not folded into ADMINS. Managing accounts and reading
    // somebody's salary are different powers, and HR needs the second without
    // the first.
    await queryRunner.query(`
      INSERT INTO "feature_masters" ("feature_code","feature_name","description")
      VALUES (113,'HR','Employee records, onboarding documents and payslips.')
      ON CONFLICT ("feature_code") DO NOTHING
    `);
    // Super Admin's grants were seeded by a CROSS JOIN when the auth module was
    // created, so a feature added later inherits nothing and must be named.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_code","feature_code","permission_code")
      SELECT r.code, 113, p.code
      FROM (VALUES (101),(103)) AS r(code)
      CROSS JOIN (VALUES (101),(102),(103),(104)) AS p(code)
      ON CONFLICT ("role_code","feature_code","permission_code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "feature_code" = 113`);
    await queryRunner.query(`DELETE FROM "feature_masters" WHERE "feature_code" = 113`);

    await queryRunner.query(
      `ALTER TABLE "stored_files" DROP CONSTRAINT IF EXISTS "vtx_stored_files_purpose_check"`,
    );
    await queryRunner.query(`
      ALTER TABLE "stored_files" ADD CONSTRAINT "vtx_stored_files_purpose_check"
        CHECK ("purpose" IN ('WHITEPAPER','CAPABILITY_STATEMENT','RESUME',
                             'QUOTE_ATTACHMENT','CERTIFICATE'))
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "employee_payslips"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_documents"`);

    // Rebuild the profile table and put the employment record back on it.
    await queryRunner.query(`
      CREATE TABLE "admin_profiles" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "admin_id"        uuid NOT NULL,
        "employee_code"   varchar(30)  NOT NULL,
        "designation"     varchar(150) NOT NULL,
        "department_code" int          NOT NULL,
        "employment_type" varchar(20)  NOT NULL,
        "mobile"          varchar(32),
        "office_code"     int,
        "joining_date"    date,
        "probation_until" date,
        "reporting_to"    uuid,
        "notes"           text,
        "created_date"    timestamptz NOT NULL DEFAULT now(),
        "updated_date"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_admin_profiles_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_admin_profiles_admin_id_unique" UNIQUE ("admin_id"),
        CONSTRAINT "vtx_admin_profiles_employee_code_unique" UNIQUE ("employee_code"),
        CONSTRAINT "vtx_admin_profiles_admin_id_fk"
          FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      INSERT INTO "admin_profiles"
        ("admin_id","employee_code","designation","department_code",
         "employment_type","mobile","office_code","joining_date")
      SELECT a."id", e."employee_code", e."designation", e."department_code",
             e."employment_type", e."mobile", e."office_code", e."joining_date"
      FROM "employees" e JOIN "admins" a ON a."employee_id" = e."id"
    `);

    await queryRunner.query(
      `ALTER TABLE "admins" DROP CONSTRAINT IF EXISTS "vtx_admins_employee_id_fk"`,
    );
    await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN IF EXISTS "employee_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employees"`);

    // The nine org departments the eight practices replaced.
    await queryRunner.query(`DELETE FROM "department_masters"`);
    await queryRunner.query(`
      INSERT INTO "department_masters" ("department_code","department_name","display_order")
      VALUES
        (101,'Engineering',1),(102,'Delivery',2),(103,'Sales',3),
        (104,'Marketing',4),(105,'Field Operations',5),(106,'Human Resources',6),
        (107,'Finance',7),(108,'Legal & Privacy',8),(109,'IT Support',9)
    `);
  }
}
