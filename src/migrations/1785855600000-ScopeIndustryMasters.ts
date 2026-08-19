import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Industries differ per brand, so the list has to be scoped.
 *
 * CreateSiteScope left `industry_masters` in the shared pile on the reasoning
 * that an industry is an industry. Putting the two lists side by side shows
 * that was wrong: IT sells to Banking & Finance and EdTech; cranes sell to
 * Petrochemical Refining and Marine & Shipbuilding. One merged list would show
 * every customer a dropdown mostly full of other people's industries.
 *
 * Codes stay GLOBALLY unique and each brand takes a range — the same pattern
 * the feature codes use. That keeps `contact_enquiries.industry_code` pointing
 * at a single unambiguous row, so nothing existing moves or breaks:
 *
 *   101–199   Veltrixair IT          (already seeded, 101–109)
 *   201–299   Veltrixair Industries  (seeded here, 201–215)
 *   301–399   Veltrixair Privacy     (when that site needs a list)
 *
 * "Government / Municipal" (214) and "Government & Public Sector" (102) are
 * deliberately separate rows. Each list should read naturally to its own
 * customers; reconciling them is a reporting concern, not a schema one.
 */
export class ScopeIndustryMasters1785855600000 implements MigrationInterface {
  name = 'ScopeIndustryMasters1785855600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "industry_masters" ADD COLUMN "site_code" integer`,
    );
    await queryRunner.query(`UPDATE "industry_masters" SET "site_code" = 101`);
    await queryRunner.query(
      `ALTER TABLE "industry_masters" ALTER COLUMN "site_code" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "industry_masters"
        ADD CONSTRAINT "vtx_industry_masters_site_code_fk"
        FOREIGN KEY ("site_code") REFERENCES "site_masters"("site_code") ON DELETE RESTRICT
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_industry_masters_site_code" ON "industry_masters" ("site_code")`,
    );

    // The sectors Veltrixair Industries actually sells crane services into,
    // taken from the quote form on veltrixairindustries.com.
    await queryRunner.query(`
      INSERT INTO "industry_masters"
        ("industry_code", "industry_name", "display_order", "site_code") VALUES
        (201, 'Oil & Gas — Upstream',            1,  102),
        (202, 'Petrochemical / Refining',        2,  102),
        (203, 'Steel & Metals',                  3,  102),
        (204, 'Cement & Building Materials',     4,  102),
        (205, 'Power Generation',                5,  102),
        (206, 'Water & Desalination',            6,  102),
        (207, 'Manufacturing — Heavy',           7,  102),
        (208, 'Manufacturing — Light / Workshop',8,  102),
        (209, 'Ports & Logistics',               9,  102),
        (210, 'Marine & Shipbuilding',           10, 102),
        (211, 'Mining & Quarrying',              11, 102),
        (212, 'Construction & EPC',              12, 102),
        (213, 'Defence & Aerospace',             13, 102),
        (214, 'Government / Municipal',          14, 102),
        (215, 'Other',                           15, 102)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "industry_masters" WHERE "site_code" = 102`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_industry_masters_site_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "industry_masters" DROP CONSTRAINT IF EXISTS "vtx_industry_masters_site_code_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "industry_masters" DROP COLUMN IF EXISTS "site_code"`,
    );
  }
}
