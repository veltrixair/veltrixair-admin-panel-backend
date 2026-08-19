import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contact module schema: master tables, the enquiry table, its event timeline,
 * the reference-number sequence, and seed data taken from the live
 * /contact-us/ page.
 *
 * Hand-written rather than generated. `migration:generate` diffs decorators
 * against a live database and produces noisy or occasionally destructive SQL;
 * anything touching personal-data columns is worth writing deliberately.
 */
export class CreateContactModule1785801600000 implements MigrationInterface {
  name = 'CreateContactModule1785801600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -- Offices ---------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "office_masters" (
        "id"              uuid NOT NULL DEFAULT gen_random_uuid(),
        "office_code"     integer NOT NULL,
        "office_name"     character varying(100) NOT NULL,
        "city"            character varying(100) NOT NULL,
        "country_name"    character varying(100) NOT NULL,
        "address"         character varying(500) NOT NULL,
        "email"           character varying(255) NOT NULL,
        "phone"           character varying(32),
        "timezone"        character varying(64) NOT NULL,
        "working_days"    integer array NOT NULL,
        "work_start_hour" integer NOT NULL DEFAULT 9,
        "work_end_hour"   integer NOT NULL DEFAULT 18,
        "display_order"   integer NOT NULL DEFAULT 0,
        "is_active"       boolean NOT NULL DEFAULT true,
        "is_deleted"      boolean NOT NULL DEFAULT false,
        "deleted_at"      timestamptz,
        "created_date"    timestamptz NOT NULL DEFAULT now(),
        "updated_date"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_office_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_office_masters_office_code_unique" UNIQUE ("office_code")
      )
    `);

    // -- Countries -------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "country_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "country_code"  integer NOT NULL,
        "country_name"  character varying(100) NOT NULL,
        "iso_code"      character varying(2),
        "office_code"   integer NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_country_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_country_masters_country_code_unique" UNIQUE ("country_code")
      )
    `);

    // -- Industries ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "industry_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "industry_code" integer NOT NULL,
        "industry_name" character varying(100) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_industry_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_industry_masters_industry_code_unique" UNIQUE ("industry_code")
      )
    `);

    // -- Enquiry topics --------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "enquiry_topic_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "topic_code"    integer NOT NULL,
        "topic_name"    character varying(100) NOT NULL,
        "route_email"   character varying(255) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_enquiry_topic_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_enquiry_topic_masters_topic_code_unique" UNIQUE ("topic_code")
      )
    `);

    // -- Enquiry timelines -----------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "enquiry_timeline_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "timeline_code" integer NOT NULL,
        "timeline_name" character varying(100) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_enquiry_timeline_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_enquiry_timeline_masters_timeline_code_unique" UNIQUE ("timeline_code")
      )
    `);

    // -- Enquiries -------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "contact_enquiries" (
        "id"                     uuid NOT NULL DEFAULT gen_random_uuid(),
        "reference_no"           character varying(30) NOT NULL,
        "topic_code"             integer NOT NULL,
        "full_name"              character varying(150) NOT NULL,
        "company"                character varying(150) NOT NULL,
        "role_title"             character varying(150),
        "work_email"             character varying(255) NOT NULL,
        "phone"                  character varying(32),
        "country_code"           integer NOT NULL,
        "industry_code"          integer,
        "timeline_code"          integer,
        "message"                character varying(1500) NOT NULL,
        "requires_nda"           boolean NOT NULL DEFAULT false,
        "consent_at"             timestamptz NOT NULL,
        "privacy_notice_version" character varying(50) NOT NULL,
        "office_code"            integer NOT NULL,
        "routed_to_email"        character varying(255) NOT NULL,
        "sla_due_at"             timestamptz NOT NULL,
        "first_responded_at"     timestamptz,
        "status"                 character varying(20) NOT NULL DEFAULT 'NEW',
        "assigned_to"            character varying(150),
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
        CONSTRAINT "vtx_contact_enquiries_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_contact_enquiries_reference_no_unique" UNIQUE ("reference_no"),
        CONSTRAINT "vtx_contact_enquiries_status_check"
          CHECK ("status" IN ('NEW','QUALIFYING','ENGAGED','WON','LOST','SPAM'))
      )
    `);

    // -- Event timeline --------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "contact_enquiry_events" (
        "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
        "enquiry_id"   uuid NOT NULL,
        "event_type"   character varying(30) NOT NULL,
        "actor"        character varying(150),
        "note"         character varying(2000),
        "metadata"     jsonb,
        "created_date" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_contact_enquiry_events_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_contact_enquiry_events_event_type_check"
          CHECK ("event_type" IN ('CREATED','STATUS_CHANGED','ASSIGNED','NOTE_ADDED','MESSAGE_VIEWED','NOTIFICATION_SENT'))
      )
    `);

    // -- Foreign keys ----------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "country_masters"
        ADD CONSTRAINT "vtx_country_masters_office_code_fk"
        FOREIGN KEY ("office_code") REFERENCES "office_masters"("office_code")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "contact_enquiries"
        ADD CONSTRAINT "vtx_contact_enquiries_topic_code_fk"
        FOREIGN KEY ("topic_code") REFERENCES "enquiry_topic_masters"("topic_code")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "contact_enquiries"
        ADD CONSTRAINT "vtx_contact_enquiries_country_code_fk"
        FOREIGN KEY ("country_code") REFERENCES "country_masters"("country_code")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "contact_enquiries"
        ADD CONSTRAINT "vtx_contact_enquiries_industry_code_fk"
        FOREIGN KEY ("industry_code") REFERENCES "industry_masters"("industry_code")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "contact_enquiries"
        ADD CONSTRAINT "vtx_contact_enquiries_timeline_code_fk"
        FOREIGN KEY ("timeline_code") REFERENCES "enquiry_timeline_masters"("timeline_code")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "contact_enquiries"
        ADD CONSTRAINT "vtx_contact_enquiries_office_code_fk"
        FOREIGN KEY ("office_code") REFERENCES "office_masters"("office_code")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "contact_enquiry_events"
        ADD CONSTRAINT "vtx_contact_enquiry_events_enquiry_id_fk"
        FOREIGN KEY ("enquiry_id") REFERENCES "contact_enquiries"("id")
        ON DELETE CASCADE
    `);

    // -- Indexes ---------------------------------------------------------
    await queryRunner.query(
      `CREATE INDEX "idx_contact_enquiries_topic_code"    ON "contact_enquiries" ("topic_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contact_enquiries_country_code"  ON "contact_enquiries" ("country_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contact_enquiries_office_code"   ON "contact_enquiries" ("office_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contact_enquiries_status"        ON "contact_enquiries" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contact_enquiries_work_email"    ON "contact_enquiries" ("work_email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contact_enquiries_created_date"  ON "contact_enquiries" ("created_date" DESC)`,
    );
    // Drives the "overdue" admin filter.
    await queryRunner.query(`
      CREATE INDEX "idx_contact_enquiries_sla_open"
        ON "contact_enquiries" ("sla_due_at")
        WHERE "first_responded_at" IS NULL AND "is_deleted" = false
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_contact_enquiry_events_enquiry_id" ON "contact_enquiry_events" ("enquiry_id")`,
    );

    // -- Reference number sequence ---------------------------------------
    // A sequence, not COUNT(*) + 1 — concurrent submits would collide.
    await queryRunner.query(
      `CREATE SEQUENCE "contact_enquiry_ref_seq" START WITH 1 INCREMENT BY 1`,
    );

    await this.seed(queryRunner);
  }

  private async seed(queryRunner: QueryRunner): Promise<void> {
    // Offices — working weeks differ: Riyadh runs Sun–Thu, the others Mon–Fri.
    await queryRunner.query(`
      INSERT INTO "office_masters"
        ("office_code","office_name","city","country_name","address","email","phone","timezone","working_days","work_start_hour","work_end_hour","display_order")
      VALUES
        (1,'Riyadh HQ','Riyadh','Saudi Arabia','King Fahd Road, Olaya District, Riyadh 11564, Kingdom of Saudi Arabia','riyadh@veltrixair.com','+91 995 587 7577','Asia/Riyadh','{0,1,2,3,4}',9,18,1),
        (2,'Dubai Regional Office','Dubai','United Arab Emirates','Dubai International Financial Centre, Sheikh Zayed Road, Dubai, UAE','dubai@veltrixair.com','+971 4 000 0000','Asia/Dubai','{1,2,3,4,5}',9,18,2),
        (3,'Bangalore Delivery Centre','Bangalore','India','Electronic City Phase 1, Hosur Road, Bangalore 560100, Karnataka','bangalore@veltrixair.com','+91 80 0000 0000','Asia/Kolkata','{1,2,3,4,5}',9,18,3)
    `);

    // Countries — exactly the 11 options on the form, each mapped to an office.
    await queryRunner.query(`
      INSERT INTO "country_masters"
        ("country_code","country_name","iso_code","office_code","display_order")
      VALUES
        (1,'Saudi Arabia (KSA)','SA',1,1),
        (2,'United Arab Emirates','AE',2,2),
        (3,'Bahrain','BH',1,3),
        (4,'Qatar','QA',1,4),
        (5,'Kuwait','KW',1,5),
        (6,'Oman','OM',1,6),
        (7,'India','IN',3,7),
        (8,'United Kingdom','GB',1,8),
        (9,'European Union',NULL,1,9),
        (10,'United States','US',1,10),
        (11,'Other',NULL,1,11)
    `);

    // Industries — the 9 options on the form.
    await queryRunner.query(`
      INSERT INTO "industry_masters" ("industry_code","industry_name","display_order")
      VALUES
        (1,'Banking & Finance',1),
        (2,'Government & Public Sector',2),
        (3,'Energy & Utilities',3),
        (4,'Healthcare & Life Sciences',4),
        (5,'Real Estate & Hospitality',5),
        (6,'Retail & E-Commerce',6),
        (7,'Manufacturing & Logistics',7),
        (8,'Education & EdTech',8),
        (9,'Other',9)
    `);

    // Topics — the 7 options, each routed to the inbox published on the page.
    await queryRunner.query(`
      INSERT INTO "enquiry_topic_masters" ("topic_code","topic_name","route_email","display_order")
      VALUES
        (1,'New Engagement','contact@veltrixair.com',1),
        (2,'RFP / RFI','contact@veltrixair.com',2),
        (3,'Partnership','contact@veltrixair.com',3),
        (4,'Voice AI Demo','voiceai@veltrixair.com',4),
        (5,'Privacy Advisory','privacy@veltrixair.com',5),
        (6,'Managed Services','contact@veltrixair.com',6),
        (7,'Other','contact@veltrixair.com',7)
    `);

    // Timelines — the 5 options on the form.
    await queryRunner.query(`
      INSERT INTO "enquiry_timeline_masters" ("timeline_code","timeline_name","display_order")
      VALUES
        (1,'Immediate (this quarter)',1),
        (2,'Next 1–3 months',2),
        (3,'3–6 months',3),
        (4,'6–12 months',4),
        (5,'Exploratory / Researching',5)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP SEQUENCE IF EXISTS "contact_enquiry_ref_seq"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_enquiry_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_enquiries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "enquiry_timeline_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "enquiry_topic_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "industry_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "country_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "office_masters"`);
  }
}
