import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SWL capacity becomes free text.
 *
 * The column was `numeric(8,2)` — one number, because the schema was written
 * assuming one crane per request. It is not: `crane_count` has always been on
 * the same form, and a six-crane inspection request genuinely carries several
 * capacities. "10 + 20 + 32 t" is what a maintenance manager writes, and the
 * validation pipe rejected it outright, so the request never arrived at all.
 *
 * `span_lift_height` two columns down is already `varchar(150)` for exactly
 * this reason. This brings SWL into line rather than inventing a third shape.
 *
 * Nothing reads the value: it is stored on submit, shown on the detail page,
 * and never filtered, sorted or compared. So there is no numeric behaviour to
 * lose — only numeric input to stop refusing.
 *
 * Existing rows convert cleanly. Postgres renders numeric(8,2) with its scale,
 * so 50 becomes "50.00"; the trim below restores what the customer typed,
 * because "50.00 t" reads like a false precision nobody claimed.
 */
export class SwlCapacityAsText1785898800000 implements MigrationInterface {
  name = 'SwlCapacityAsText1785898800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "crane_quote_requests"
        ALTER COLUMN "swl_tonnes" TYPE varchar(150)
        USING CASE
          WHEN "swl_tonnes" IS NULL THEN NULL
          ELSE trim(trailing '.' from trim(trailing '0' from "swl_tonnes"::text))
        END
    `);
  }

  /**
   * Reverting keeps only what is still a single number.
   *
   * Anything entered as text since — the multi-crane values this migration
   * exists to allow — cannot become a numeric, so it goes to NULL rather than
   * failing the whole rollback. That is lossy, and deliberately so: the down
   * path restores the old shape, and the old shape could not hold them.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "crane_quote_requests"
        ALTER COLUMN "swl_tonnes" TYPE numeric(8,2)
        USING CASE
          WHEN "swl_tonnes" ~ '^[0-9]+(\\.[0-9]{1,2})?$'
            THEN "swl_tonnes"::numeric(8,2)
          ELSE NULL
        END
    `);
  }
}
