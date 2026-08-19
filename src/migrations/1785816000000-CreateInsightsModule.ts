import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Insights card grid for /insights/.
 *
 * Cards only — there is no body column and no article detail page. The site
 * links cards with hash anchors (#sovereign-k8s-gcc-bank), so the slugs seeded
 * here match those anchors.
 *
 * Seeds the 14 cards currently on the page. Title, type, author, date and
 * reading time are taken verbatim. TOPIC and REGION are NOT printed on the
 * cards, so they are inferred from each piece's subject matter and should be
 * reviewed. `dek` is left null rather than reproducing truncated copy.
 */
export class CreateInsightsModule1785816000000 implements MigrationInterface {
  name = 'CreateInsightsModule1785816000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -- Masters ---------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "article_type_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "type_code"     integer NOT NULL,
        "type_name"     character varying(100) NOT NULL,
        "slug"          character varying(100) NOT NULL,
        "colour_hex"    character varying(7),
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_article_type_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_article_type_masters_type_code_unique" UNIQUE ("type_code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "article_topic_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "topic_code"    integer NOT NULL,
        "topic_name"    character varying(100) NOT NULL,
        "slug"          character varying(100) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_article_topic_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_article_topic_masters_topic_code_unique" UNIQUE ("topic_code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "region_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "region_code"   integer NOT NULL,
        "region_name"   character varying(100) NOT NULL,
        "slug"          character varying(100) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_region_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_region_masters_region_code_unique" UNIQUE ("region_code")
      )
    `);

    // -- Articles --------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "articles" (
        "id"                uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug"              character varying(200) NOT NULL,
        "title"             character varying(300) NOT NULL,
        "dek"               character varying(600),
        "author_name"       character varying(150) NOT NULL,
        "type_code"         integer NOT NULL,
        "topic_code"        integer NOT NULL,
        "reading_value"     integer NOT NULL,
        "reading_unit"      character varying(10) NOT NULL DEFAULT 'MINUTES',
        "estimated_minutes" integer NOT NULL,
        "featured"          boolean NOT NULL DEFAULT false,
        "display_order"     integer NOT NULL DEFAULT 0,
        "status"            character varying(10) NOT NULL DEFAULT 'DRAFT',
        "published_at"      timestamptz,
        "is_deleted"        boolean NOT NULL DEFAULT false,
        "deleted_at"        timestamptz,
        "created_date"      timestamptz NOT NULL DEFAULT now(),
        "updated_date"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_articles_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_articles_slug_unique" UNIQUE ("slug"),
        CONSTRAINT "vtx_articles_status_check"
          CHECK ("status" IN ('DRAFT','PUBLISHED','ARCHIVED')),
        CONSTRAINT "vtx_articles_reading_unit_check"
          CHECK ("reading_unit" IN ('MINUTES','PAGES'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "article_regions" (
        "article_id"  uuid NOT NULL,
        "region_code" integer NOT NULL,
        CONSTRAINT "vtx_article_regions_pk" PRIMARY KEY ("article_id", "region_code")
      )
    `);

    // -- Foreign keys ----------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "articles" ADD CONSTRAINT "vtx_articles_type_code_fk"
      FOREIGN KEY ("type_code") REFERENCES "article_type_masters"("type_code") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "articles" ADD CONSTRAINT "vtx_articles_topic_code_fk"
      FOREIGN KEY ("topic_code") REFERENCES "article_topic_masters"("topic_code") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "article_regions" ADD CONSTRAINT "vtx_article_regions_article_id_fk"
      FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "article_regions" ADD CONSTRAINT "vtx_article_regions_region_code_fk"
      FOREIGN KEY ("region_code") REFERENCES "region_masters"("region_code") ON DELETE RESTRICT
    `);

    // -- Indexes ---------------------------------------------------------
    await queryRunner.query(
      `CREATE INDEX "idx_articles_type_code" ON "articles" ("type_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_articles_topic_code" ON "articles" ("topic_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_articles_status" ON "articles" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_articles_featured" ON "articles" ("featured")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_articles_published_at" ON "articles" ("published_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_articles_estimated_minutes" ON "articles" ("estimated_minutes")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_article_regions_region_code" ON "article_regions" ("region_code")`,
    );
    // Default listing: published, newest first.
    await queryRunner.query(`
      CREATE INDEX "idx_articles_published_listing"
        ON "articles" ("published_at" DESC)
        WHERE "status" = 'PUBLISHED' AND "is_deleted" = false
    `);

    await this.seed(queryRunner);
  }

  private async seed(queryRunner: QueryRunner): Promise<void> {
    // Colours approximate the badges on the live page — replace with the exact
    // brand values when they are available.
    await queryRunner.query(`
      INSERT INTO "article_type_masters" ("type_code","type_name","slug","colour_hex","display_order")
      VALUES
        (101,'Insight','insight','#1E3A8A',1),
        (102,'Case Study','case-study','#0F766E',2),
        (103,'Whitepaper','whitepaper','#7C3AED',3),
        (104,'Regulatory Update','regulatory-update','#B45309',4),
        (105,'Perspective','perspective','#A16207',5)
    `);

    await queryRunner.query(`
      INSERT INTO "article_topic_masters" ("topic_code","topic_name","slug","display_order")
      VALUES
        (101,'Software','software',1),
        (102,'Platform','platform',2),
        (103,'Cybersecurity','cybersecurity',3),
        (104,'Data Privacy','data-privacy',4),
        (105,'AI & ML','ai-ml',5),
        (106,'Business Apps','business-apps',6),
        (107,'Growth','growth',7)
    `);

    await queryRunner.query(`
      INSERT INTO "region_masters" ("region_code","region_name","slug","display_order")
      VALUES
        (101,'KSA','ksa',1),
        (102,'GCC','gcc',2),
        (103,'India','india',3),
        (104,'Global','global',4)
    `);

    // estimated_minutes = value for MINUTES, value * 3 for PAGES.
    await queryRunner.query(`
      INSERT INTO "articles"
        ("slug","title","author_name","type_code","topic_code",
         "reading_value","reading_unit","estimated_minutes",
         "featured","display_order","status","published_at")
      VALUES
        ('pdpl-readiness','Six steps to PDPL operational readiness — without breaking the business.','Senior Privacy Advisor',101,104,14,'MINUTES',14,false,1,'PUBLISHED','2026-04-22T00:00:00Z'),
        ('sovereign-k8s-gcc-bank','Building a sovereign Kubernetes platform for a regulated GCC bank.','Platform Engineering Practice',102,102,11,'MINUTES',11,false,2,'PUBLISHED','2026-04-15T00:00:00Z'),
        ('ai-governance-iso-42001','AI governance under ISO 42001 — a practitioner''s guide for KSA & India.','Cybersecurity & AI Practice',103,105,32,'PAGES',96,false,3,'PUBLISHED','2026-04-08T00:00:00Z'),
        ('enterprise-stack-that-compounds','The enterprise stack that compounds: building for the decade ahead.','Ambreen Zeba, Chairman',105,101,14,'MINUTES',14,true,4,'PUBLISHED','2026-04-01T00:00:00Z'),
        ('zatca-phase-2-march-2026','ZATCA Phase 2: what changed in March 2026.','Business Applications Practice',104,106,8,'MINUTES',8,false,5,'PUBLISHED','2026-03-28T00:00:00Z'),
        ('india-dpdp-twelve-months','India DPDP — twelve months in.','Privacy Advisory Team, Bangalore',101,104,12,'MINUTES',12,false,6,'PUBLISHED','2026-03-20T00:00:00Z'),
        ('odoo-go-live-multi-entity','Six-month Odoo go-live for a multi-entity manufacturer.','Business Applications Practice',102,106,9,'MINUTES',9,false,7,'PUBLISHED','2026-03-12T00:00:00Z'),
        ('why-platform-teams-fail','Why platform teams fail.','Platform Engineering Practice',101,102,12,'MINUTES',12,false,8,'PUBLISHED','2026-03-05T00:00:00Z'),
        ('sovereign-soc-managed-detection','The sovereign SOC: architecting managed detection.','Cybersecurity Practice',103,103,28,'PAGES',84,false,9,'PUBLISHED','2026-02-26T00:00:00Z'),
        ('building-ai-humans-imagine','Building AI for what humans imagine next.','Office of the Chairman',105,105,7,'MINUTES',7,false,10,'PUBLISHED','2026-02-18T00:00:00Z'),
        ('sovereign-service-desk-eight-weeks','Standing up a sovereign service desk in eight weeks.','Managed Services Practice',102,102,10,'MINUTES',10,false,11,'PUBLISHED','2026-02-10T00:00:00Z'),
        ('b2b-marketing-stack-compounds','The B2B marketing stack that actually compounds.','Digital & Growth Practice',101,107,10,'MINUTES',10,false,12,'PUBLISHED','2026-02-04T00:00:00Z'),
        ('uae-decree-law-45-2021','UAE Federal Decree-Law 45/2021: executive regulations.','Privacy Advisory · Dubai',104,104,9,'MINUTES',9,false,13,'PUBLISHED','2026-01-28T00:00:00Z'),
        ('rebuild-replatform-refactor','How to choose between rebuild, replatform, refactor.','Custom Software Practice',101,101,8,'MINUTES',8,false,14,'PUBLISHED','2026-01-20T00:00:00Z')
    `);

    // Region tagging — inferred from subject matter, not printed on the cards.
    // The ISO 42001 whitepaper is explicitly "KSA & India", hence two rows.
    await queryRunner.query(`
      INSERT INTO "article_regions" ("article_id","region_code")
      SELECT a.id, v.region_code
      FROM (VALUES
        ('pdpl-readiness',101),
        ('sovereign-k8s-gcc-bank',102),
        ('ai-governance-iso-42001',101),('ai-governance-iso-42001',103),
        ('enterprise-stack-that-compounds',104),
        ('zatca-phase-2-march-2026',101),
        ('india-dpdp-twelve-months',103),
        ('odoo-go-live-multi-entity',102),
        ('why-platform-teams-fail',104),
        ('sovereign-soc-managed-detection',101),
        ('building-ai-humans-imagine',104),
        ('sovereign-service-desk-eight-weeks',101),
        ('b2b-marketing-stack-compounds',104),
        ('uae-decree-law-45-2021',102),
        ('rebuild-replatform-refactor',104)
      ) AS v(slug, region_code)
      JOIN "articles" a ON a.slug = v.slug
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "article_regions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "articles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "region_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "article_topic_masters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "article_type_masters"`);
  }
}
