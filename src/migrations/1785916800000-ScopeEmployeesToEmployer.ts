import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * An employee belongs to one business unit.
 *
 * `employees` was created company-wide, so a Privacy admin could read an IT
 * colleague's personnel file. HR is answerable per unit, and the file carries a
 * mobile number, a bank proof and a salary — the least that should travel
 * between brands.
 *
 * NOT the same column as `site_code` elsewhere, and named so it cannot be
 * mistaken for one. Everywhere else `site_code` answers "which dashboard does
 * this record belong to". Here it answers "which unit employs this person",
 * which is a fact about their contract. Which dashboards they may open is a
 * different question with a different, plural answer, and it stays in
 * `admin_roles`: the root account holds badges on all three brands while being
 * employed by one.
 *
 * Backfilled from the badges of the account each employee was migrated from —
 * every one of them is on site 101 today, so nothing is guessed.
 */
export class ScopeEmployeesToEmployer1785916800000 implements MigrationInterface {
  name = 'ScopeEmployeesToEmployer1785916800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" ADD COLUMN "employer_site_code" int`,
    );

    // The unit whose dashboard their account was created on. MIN so that an
    // account holding several badges resolves to one answer rather than none.
    await queryRunner.query(`
      UPDATE "employees" e
      SET "employer_site_code" = sub.site_code
      FROM (
        SELECT a."employee_id", MIN(r."site_code") AS site_code
        FROM "admins" a
        JOIN "admin_roles" r ON r."admin_id" = a."id"
        WHERE a."employee_id" IS NOT NULL
        GROUP BY a."employee_id"
      ) AS sub
      WHERE e."id" = sub."employee_id"
    `);

    // Anyone filed without an account yet — none today, but the column has to
    // be complete before it can be NOT NULL.
    await queryRunner.query(`
      UPDATE "employees" SET "employer_site_code" = 101
      WHERE "employer_site_code" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "employees" ALTER COLUMN "employer_site_code" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "employees"
        ADD CONSTRAINT "vtx_employees_employer_site_code_fk"
        FOREIGN KEY ("employer_site_code") REFERENCES "site_masters"("site_code")
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_employees_employer_site_code" ON "employees" ("employer_site_code")`,
    );
    await queryRunner.query(`
      COMMENT ON COLUMN "employees"."employer_site_code" IS
        'Which unit employs this person. NOT which dashboards they may open — that is admin_roles, and it is plural.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_employees_employer_site_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "vtx_employees_employer_site_code_fk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN IF EXISTS "employer_site_code"`,
    );
  }
}
