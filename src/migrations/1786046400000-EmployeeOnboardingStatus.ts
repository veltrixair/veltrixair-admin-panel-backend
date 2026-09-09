import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Onboarding status becomes something a person sets, not something inferred.
 *
 * It was never stored. The panel worked it out in the browser — all documents
 * verified meant "Completed", anything else meant "In progress" — which made
 * the status a restatement of the document counts sitting in the next column
 * along, and left the list with no status filter because there was nothing on
 * the server to filter by.
 *
 * That reading is also wrong about the two things HR actually needs to say. A
 * record filed this morning and one that has been chasing a missing passport
 * for three weeks were both "In progress". And a document count cannot express
 * a file that is finished because somebody waived a requirement, or one that
 * is parked waiting on a visa.
 *
 * Four states, deliberately: the two the design shows, plus the two that
 * distinction. The counts stay exactly where they are, in their own column —
 * they remain a useful fact, they are just no longer pretending to be a
 * decision.
 *
 * BACKFILL — every employee is given eight document rows at MISSING the moment
 * they are filed, so "has no documents" is not a state that exists. The three
 * that do are read directly:
 *
 *   all eight VERIFIED   -> COMPLETED    (what the panel already showed)
 *   all eight MISSING    -> NOT_STARTED  (filed, nothing submitted yet)
 *   anything in between  -> IN_PROGRESS
 *
 * Only NOT_STARTED changes what anyone sees: those rows read "In progress"
 * before, which is what prompted this. Nobody is quietly marked complete who
 * was not already.
 */
export class EmployeeOnboardingStatus1786046400000 implements MigrationInterface {
  name = 'EmployeeOnboardingStatus1786046400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * NOT_STARTED as the column default, because that is what a newly filed
     * employee is — the eight document rows are created alongside them and all
     * eight start MISSING.
     */
    await queryRunner.query(
      `ALTER TABLE "employees"
         ADD COLUMN "onboarding_status" character varying(20)
         NOT NULL DEFAULT 'NOT_STARTED'`,
    );

    /*
     * A CHECK rather than an enum type, matching how every other status column
     * in this schema is written.
     */
    await queryRunner.query(
      `ALTER TABLE "employees"
         ADD CONSTRAINT "vtx_employees_onboarding_status_check"
         CHECK ("onboarding_status" IN (
           'NOT_STARTED','IN_PROGRESS','ON_HOLD','COMPLETED'
         ))`,
    );

    /* Everyone with at least one document that is not MISSING is under way. */
    await queryRunner.query(
      `UPDATE "employees" e
          SET "onboarding_status" = 'IN_PROGRESS'
        WHERE EXISTS (
          SELECT 1 FROM "employee_documents" d
           WHERE d."employee_id" = e."id"
             AND d."status" <> 'MISSING'
        )`,
    );

    /*
     * And everyone whose documents are all verified is finished — written
     * second so it wins over the row above, which it overlaps by definition.
     * `NOT EXISTS (... <> 'VERIFIED')` rather than counting, so an employee
     * with no document rows at all could never fall through as complete.
     */
    await queryRunner.query(
      `UPDATE "employees" e
          SET "onboarding_status" = 'COMPLETED'
        WHERE EXISTS (
                SELECT 1 FROM "employee_documents" d
                 WHERE d."employee_id" = e."id"
              )
          AND NOT EXISTS (
                SELECT 1 FROM "employee_documents" d
                 WHERE d."employee_id" = e."id"
                   AND d."status" <> 'VERIFIED'
              )`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_employees_onboarding_status"
         ON "employees" ("onboarding_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_employees_onboarding_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees"
        DROP CONSTRAINT IF EXISTS "vtx_employees_onboarding_status_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN IF EXISTS "onboarding_status"`,
    );
  }
}
