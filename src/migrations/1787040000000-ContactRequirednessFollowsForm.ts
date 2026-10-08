import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the enquiry table agree with the form about what is required.
 *
 * The rule applied, and the reason for it: the page decides. A field the form
 * lets someone skip but the server then refuses produces an error nobody can
 * act on — the thing being demanded is not marked on screen. The reverse, a
 * field the form insists on but the server shrugs at, is harmless but means
 * the guarantee lives in one place only.
 *
 *   company  required -> optional  (the form never marked it)
 *   message  required -> optional  (likewise)
 *   phone    optional -> required  (the form marks it, the DTO did not)
 *
 * `phone` is tightened in the DTO only; the column stays nullable because rows
 * written before this exist without one, and a NOT NULL would either fail or
 * need an invented value. New submissions carry it; old ones stay honest about
 * not having it.
 */
export class ContactRequirednessFollowsForm1787040000000 implements MigrationInterface {
  name = 'ContactRequirednessFollowsForm1787040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contact_enquiries"
        ALTER COLUMN "company" DROP NOT NULL,
        ALTER COLUMN "message" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Restoring NOT NULL would fail on any row written while the columns were
     * optional, so those are filled with a marker first. It is deliberately
     * not a plausible value: "(not provided)" reads as missing data, where an
     * empty string would read as an answer somebody gave.
     */
    await queryRunner.query(`
      UPDATE "contact_enquiries"
         SET "company" = COALESCE("company", '(not provided)'),
             "message" = COALESCE("message", '(not provided)')
    `);
    await queryRunner.query(`
      ALTER TABLE "contact_enquiries"
        ALTER COLUMN "company" SET NOT NULL,
        ALTER COLUMN "message" SET NOT NULL
    `);
  }
}
