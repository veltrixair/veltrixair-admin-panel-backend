import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Careers module — Scope A (job listings only).
 *
 * Applications, resume upload and the hiring pipeline are deliberately absent:
 * the live site routes every application to careers@veltrixair.com and has no
 * form. See docs when that changes.
 *
 * Seeds the 14 roles currently listed on /careers/ (R-001 - R-014). Full job
 * descriptions are NOT seeded — the public page only exposes title, location,
 * type, experience and practice, so description_mdx is left null for the
 * content team to author rather than inventing copy.
 */
export class CreateCareersModule1785805200000 implements MigrationInterface {
  name = 'CreateCareersModule1785805200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -- Masters ---------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "practice_area_masters" (
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
        CONSTRAINT "vtx_practice_area_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_practice_area_masters_practice_code_unique" UNIQUE ("practice_code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "job_location_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "location_code" integer NOT NULL,
        "location_name" character varying(100) NOT NULL,
        "slug"          character varying(100) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_job_location_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_job_location_masters_location_code_unique" UNIQUE ("location_code")
      )
    `);

    // -- Job postings ----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "job_postings" (
        "id"                   uuid NOT NULL DEFAULT gen_random_uuid(),
        "ref_code"             character varying(20) NOT NULL,
        "slug"                 character varying(200) NOT NULL,
        "title"                character varying(200) NOT NULL,
        "summary"              character varying(500),
        "description_mdx"      text,
        "responsibilities"     text array NOT NULL DEFAULT '{}',
        "requirements"         text array NOT NULL DEFAULT '{}',
        "practice_code"        integer NOT NULL,
        "location_label"       character varying(150) NOT NULL,
        "work_mode"            character varying(10) NOT NULL DEFAULT 'ONSITE',
        "office_code"          integer NOT NULL,
        "employment_type"      character varying(100) NOT NULL,
        "experience_label"     character varying(50) NOT NULL,
        "experience_min_years" integer,
        "experience_max_years" integer,
        "visa_sponsorship"     boolean,
        "hot_role"             boolean NOT NULL DEFAULT false,
        "display_order"        integer NOT NULL DEFAULT 0,
        "seo_title"            character varying(200),
        "seo_description"      character varying(500),
        "status"               character varying(10) NOT NULL DEFAULT 'DRAFT',
        "posted_at"            timestamptz,
        "closes_at"            timestamptz,
        "is_deleted"           boolean NOT NULL DEFAULT false,
        "deleted_at"           timestamptz,
        "created_date"         timestamptz NOT NULL DEFAULT now(),
        "updated_date"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_job_postings_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_job_postings_ref_code_unique" UNIQUE ("ref_code"),
        CONSTRAINT "vtx_job_postings_slug_unique" UNIQUE ("slug"),
        CONSTRAINT "vtx_job_postings_status_check"
          CHECK ("status" IN ('DRAFT','OPEN','CLOSED')),
        CONSTRAINT "vtx_job_postings_work_mode_check"
          CHECK ("work_mode" IN ('ONSITE','HYBRID','REMOTE'))
      )
    `);

    // A role can carry several locations ("Dubai / Riyadh").
    await queryRunner.query(`
      CREATE TABLE "job_posting_locations" (
        "job_posting_id" uuid NOT NULL,
        "location_code"  integer NOT NULL,
        CONSTRAINT "vtx_job_posting_locations_pk" PRIMARY KEY ("job_posting_id", "location_code")
      )
    `);

    // -- Foreign keys ----------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "job_postings"
        ADD CONSTRAINT "vtx_job_postings_practice_code_fk"
        FOREIGN KEY ("practice_code") REFERENCES "practice_area_masters"("practice_code")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "job_postings"
        ADD CONSTRAINT "vtx_job_postings_office_code_fk"
        FOREIGN KEY ("office_code") REFERENCES "office_masters"("office_code")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "job_posting_locations"
        ADD CONSTRAINT "vtx_job_posting_locations_job_posting_id_fk"
        FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id")
        ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "job_posting_locations"
        ADD CONSTRAINT "vtx_job_posting_locations_location_code_fk"
        FOREIGN KEY ("location_code") REFERENCES "job_location_masters"("location_code")
        ON DELETE RESTRICT
    `);

    // -- Indexes ---------------------------------------------------------
    await queryRunner.query(
      `CREATE INDEX "idx_job_postings_practice_code" ON "job_postings" ("practice_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_job_postings_status" ON "job_postings" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_job_postings_hot_role" ON "job_postings" ("hot_role")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_job_posting_locations_location_code" ON "job_posting_locations" ("location_code")`,
    );
    // Drives the default public listing order.
    await queryRunner.query(`
      CREATE INDEX "idx_job_postings_open_listing"
        ON "job_postings" ("hot_role" DESC, "display_order" ASC)
        WHERE "status" = 'OPEN' AND "is_deleted" = false
    `);

    await this.seed(queryRunner);
  }

  private async seed(queryRunner: QueryRunner): Promise<void> {
    // The 8 practice chips on /careers/.
    await queryRunner.query(`
      INSERT INTO "practice_area_masters" ("practice_code","practice_name","slug","display_order")
      VALUES
        (1,'Software','software',1),
        (2,'Platform','platform',2),
        (3,'Cyber','cyber',3),
        (4,'Privacy','privacy',4),
        (5,'Managed','managed',5),
        (6,'Business Apps','business-apps',6),
        (7,'Growth','growth',7),
        (8,'Ops','ops',8)
    `);

    // The 4 location chips. "Remote" is a filter value, not an office.
    await queryRunner.query(`
      INSERT INTO "job_location_masters" ("location_code","location_name","slug","display_order")
      VALUES
        (1,'Riyadh','riyadh',1),
        (2,'Dubai','dubai',2),
        (3,'Bangalore','bangalore',3),
        (4,'Remote','remote',4)
    `);

    // R-001 - R-014, exactly as listed on the page.
    await queryRunner.query(`
      INSERT INTO "job_postings"
        ("ref_code","slug","title","practice_code","location_label","work_mode","office_code",
         "employment_type","experience_label","experience_min_years","experience_max_years",
         "hot_role","display_order","status","posted_at")
      VALUES
        ('R-001','senior-software-engineer-custom-software','Senior Software Engineer — Custom Software Practice',1,'Riyadh','ONSITE',1,'Full-time','5–8 yrs',5,8,true,1,'OPEN',now()),
        ('R-002','staff-platform-engineer-internal-developer-platform','Staff Platform Engineer — Internal Developer Platform',2,'Riyadh / Hybrid','HYBRID',1,'Full-time','8+ yrs',8,NULL,true,2,'OPEN',now()),
        ('R-003','software-engineer-backend-python-django','Software Engineer — Backend (Python / Django)',1,'Bangalore','ONSITE',3,'Full-time','3–5 yrs',3,5,false,3,'OPEN',now()),
        ('R-004','senior-devops-engineer','Senior DevOps Engineer',2,'Bangalore / Remote','HYBRID',3,'Full-time','5+ yrs',5,NULL,false,4,'OPEN',now()),
        ('R-005','soc-analyst-tier-2-sovereign-operations','SOC Analyst — Tier 2 (Sovereign Operations)',3,'Riyadh','ONSITE',1,'Full-time, 24/7 shifts','3+ yrs',3,NULL,true,5,'OPEN',now()),
        ('R-006','cloud-security-architect','Cloud Security Architect',3,'Dubai','ONSITE',2,'Full-time','7+ yrs',7,NULL,false,6,'OPEN',now()),
        ('R-007','senior-privacy-advisor-pdpl-gdpr','Senior Privacy Advisor — PDPL & GDPR Programmes',4,'Riyadh / Hybrid','HYBRID',1,'Full-time','6+ yrs',6,NULL,true,7,'OPEN',now()),
        ('R-008','privacy-associate-india-dpdp','Privacy Associate — India DPDP Practice',4,'Bangalore','ONSITE',3,'Full-time','2–4 yrs',2,4,false,8,'OPEN',now()),
        ('R-009','service-desk-lead-managed-it-operations','Service Desk Lead — Managed IT Operations',5,'Riyadh','ONSITE',1,'Full-time','5+ yrs',5,NULL,false,9,'OPEN',now()),
        ('R-010','odoo-functional-consultant-business-applications','Odoo Functional Consultant — Business Applications',6,'Dubai / Riyadh','ONSITE',2,'Full-time','4+ yrs',4,NULL,false,10,'OPEN',now()),
        ('R-011','zatca-phase-2-integration-consultant','ZATCA Phase 2 Integration Consultant',6,'Riyadh','ONSITE',1,'Full-time','3+ yrs',3,NULL,false,11,'OPEN',now()),
        ('R-012','b2b-content-strategist-digital-growth','B2B Content Strategist — Digital & Growth',7,'Dubai / Remote','HYBRID',2,'Full-time','5+ yrs',5,NULL,false,12,'OPEN',now()),
        ('R-013','operations-manager-shared-services','Operations Manager — Shared Services',8,'Riyadh','ONSITE',1,'Full-time','6+ yrs',6,NULL,false,13,'OPEN',now()),
        ('R-014','ai-ml-engineer-voice-ai-llm-practice','AI / ML Engineer — Voice AI & LLM Practice',1,'Remote (KSA / India)','REMOTE',1,'Full-time','4+ yrs',4,NULL,true,14,'OPEN',now())
    `);

    // Location mapping. Multi-location roles get several rows.
    await queryRunner.query(`
      INSERT INTO "job_posting_locations" ("job_posting_id","location_code")
      SELECT j.id, v.location_code
      FROM (VALUES
        ('R-001',1),
        ('R-002',1),
        ('R-003',3),
        ('R-004',3),('R-004',4),
        ('R-005',1),
        ('R-006',2),
        ('R-007',1),
        ('R-008',3),
        ('R-009',1),
        ('R-010',2),('R-010',1),
        ('R-011',1),
        ('R-012',2),('R-012',4),
        ('R-013',1),
        ('R-014',4)
      ) AS v(ref_code, location_code)
      JOIN "job_postings" j ON j.ref_code = v.ref_code
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_posting_locations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "job_postings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "job_location_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "practice_area_masters"`);
  }
}
