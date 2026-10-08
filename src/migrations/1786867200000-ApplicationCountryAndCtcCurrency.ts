import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Maps the remaining location and pay fields to the shape the apply form sends.
 *
 *   1. `country_code` (int, FK to country_masters) becomes `current_country`
 *      (plain text). The form asks "which country are you based in" with a free
 *      text input, and nothing downstream ever read the code: every use of it
 *      in the applications module was the insert and a join that existed only
 *      to print the name back.
 *
 *      country_masters is not a country list — it is a routing table. Each row
 *      carries an owning office, and a contact enquiry's SLA clock runs on that
 *      office's working week. Pointing a careers question at it meant a
 *      candidate's home country had to be one of eleven markets, and adding the
 *      rest of the world would have forced an office decision for each. The
 *      table itself is untouched; the contact form still uses it exactly as
 *      before.
 *
 *   2. `current_ctc_currency` is added, because the form sends a currency
 *      beside the current-CTC amount and it was being dropped on the floor.
 *      "12,00,000" means very different things in INR and AED, and current_ctc
 *      is free text that need not name its own currency.
 */
export class ApplicationCountryAndCtcCurrency1786867200000 implements MigrationInterface {
  name = 'ApplicationCountryAndCtcCurrency1786867200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_applications" ADD COLUMN "current_country" varchar(100)
    `);

    // Carry the names across before the code goes. The join is the only place
    // the name has ever lived, so this is the last moment it is available.
    await queryRunner.query(`
      UPDATE "job_applications" a
         SET "current_country" = c."country_name"
        FROM "country_masters" c
       WHERE c."country_code" = a."country_code"
    `);

    await queryRunner.query(`
      ALTER TABLE "job_applications"
        DROP CONSTRAINT IF EXISTS "vtx_job_applications_country_code_fk"
    `);
    await queryRunner.query(`
      ALTER TABLE "job_applications" DROP COLUMN "country_code"
    `);

    await queryRunner.query(`
      ALTER TABLE "job_applications"
        ADD COLUMN "current_ctc_currency" varchar(3)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_applications" DROP COLUMN IF EXISTS "current_ctc_currency"
    `);

    await queryRunner.query(`
      ALTER TABLE "job_applications" ADD COLUMN "country_code" int
    `);

    /*
     * Re-coded by matching the stored name back to the master, which only
     * succeeds for rows whose country was one of the eleven. Anything typed
     * freely while this migration was applied has no code to go back to and is
     * left null — the alternative is inventing one, and "Other" would be a
     * worse record than nothing.
     */
    await queryRunner.query(`
      UPDATE "job_applications" a
         SET "country_code" = c."country_code"
        FROM "country_masters" c
       WHERE c."country_name" = a."current_country"
    `);

    await queryRunner.query(`
      ALTER TABLE "job_applications"
        ADD CONSTRAINT "vtx_job_applications_country_code_fk"
          FOREIGN KEY ("country_code")
          REFERENCES "country_masters" ("country_code")
          ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "job_applications" DROP COLUMN "current_country"
    `);
  }
}
