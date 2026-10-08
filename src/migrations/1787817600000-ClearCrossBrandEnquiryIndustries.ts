import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clears industry codes that belong to another brand.
 *
 * Industry is a tenanted master — IT runs 101-109, crane 201-215 — and nothing
 * on the public contact form checked that a submitted code belonged to the
 * submitting site. Three IT enquiries ended up carrying 201, which is crane's
 * "Oil & Gas — Upstream". IT's options list cannot resolve it, so the panel had
 * no label and printed the bare number.
 *
 * NULL rather than a guess. There is no honest mapping from a crane industry to
 * an IT one, and filing them under IT's "Other" would claim the sender chose
 * something they never saw. A blank says what is true: we do not know what they
 * picked, because the answer we recorded was not on their form.
 *
 * Written as a join on the master rather than a hardcoded `= 201`, so it also
 * catches any other cross-brand code already sitting in the table.
 *
 * `assertContactCodes` now refuses these at submission, so this is a one-off
 * tidy of what got through before the door was closed.
 */
export class ClearCrossBrandEnquiryIndustries1787817600000
  implements MigrationInterface
{
  name = 'ClearCrossBrandEnquiryIndustries1787817600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "contact_enquiries" e
         SET "industry_code" = NULL
       WHERE "industry_code" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM "industry_masters" m
            WHERE m."industry_code" = e."industry_code"
              AND m."site_code" = e."site_code"
         )
    `);
  }

  /**
   * Deliberately empty.
   *
   * The codes are gone, and restoring them would mean writing crane industries
   * back onto IT enquiries — re-creating the fault this migration exists to
   * remove. Down migrations undo a schema change; this one corrected data, and
   * the incorrect data is not worth reinstating.
   */
  public async down(): Promise<void> {
    // no-op
  }
}
