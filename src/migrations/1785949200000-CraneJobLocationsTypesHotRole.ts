import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Three changes the crane careers board needs, all to the same table's inputs.
 *
 * LOCATIONS — the seeded list mixed a region in with cities: "Eastern
 * Province" sits alongside Riyadh and Jubail, while Dammam and Yanbu, which
 * are cities inside it, were missing. A candidate searches for the city they
 * would travel to, so the cities are added. The region is kept active rather
 * than retired — a role genuinely spread across the Eastern Province is a real
 * thing to advertise, and nothing is gained by deleting an option somebody may
 * already have used.
 *
 * EMPLOYMENT TYPES — the seeded three describe an engagement pattern for KSA
 * site work: Iqama-resident, On-call, Shift roster. Useful facts, but not what
 * "employment type" means to somebody reading a job advert, and not what the
 * board is being built to show. Full-time, Part-time and Contract are added as
 * new codes and the old three deactivated rather than renamed: renaming would
 * silently change what the one published advert claims about itself, and
 * deleting them would break its foreign key. Deactivated rows stay valid
 * references and simply stop being offered.
 *
 * HOT ROLE — the flag already exists on the IT board and drives the badge and
 * the pin-to-top on the careers page. There was never a reason for the two
 * brands to differ.
 */
export class CraneJobLocationsTypesHotRole1785949200000
  implements MigrationInterface
{
  name = 'CraneJobLocationsTypesHotRole1785949200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- locations: three cities, added alongside what is there -----------
    await queryRunner.query(`
      INSERT INTO "crane_job_location_masters"
        ("location_code","location_name","display_order") VALUES
        (205, 'Dammam',      5),
        (206, 'Yanbu',       6),
        (207, 'NEOM (site)', 7)
      ON CONFLICT ("location_code") DO NOTHING
    `);

    // --- employment types: the three an advert actually states ------------
    await queryRunner.query(`
      INSERT INTO "crane_employment_type_masters"
        ("employment_type_code","employment_type_name","display_order") VALUES
        (204, 'Full-time', 1),
        (205, 'Part-time', 2),
        (206, 'Contract',  3)
      ON CONFLICT ("employment_type_code") DO NOTHING
    `);

    /*
     * Move the one published advert before the old option leaves the list.
     * A senior installation engineer on an Iqama-resident contract is a
     * full-time role; the engagement detail belongs in the description now.
     */
    await queryRunner.query(
      `UPDATE "crane_job_postings" SET "employment_type_code" = 204
        WHERE "employment_type_code" IN (201, 202, 203)`,
    );

    /* Kept, not deleted — existing references stay valid, new ones stop. */
    await queryRunner.query(
      `UPDATE "crane_employment_type_masters" SET "is_active" = false
        WHERE "employment_type_code" IN (201, 202, 203)`,
    );

    // --- hot role ---------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "crane_job_postings"
         ADD COLUMN "hot_role" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_crane_job_postings_hot_role"
         ON "crane_job_postings" ("hot_role")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_crane_job_postings_hot_role"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crane_job_postings" DROP COLUMN IF EXISTS "hot_role"`,
    );

    await queryRunner.query(
      `UPDATE "crane_employment_type_masters" SET "is_active" = true
        WHERE "employment_type_code" IN (201, 202, 203)`,
    );
    await queryRunner.query(
      `UPDATE "crane_job_postings" SET "employment_type_code" = 201
        WHERE "employment_type_code" IN (204, 205, 206)`,
    );
    await queryRunner.query(
      `DELETE FROM "crane_employment_type_masters"
        WHERE "employment_type_code" IN (204, 205, 206)`,
    );
    await queryRunner.query(
      `DELETE FROM "crane_job_location_masters"
        WHERE "location_code" IN (205, 206, 207)`,
    );
  }
}
