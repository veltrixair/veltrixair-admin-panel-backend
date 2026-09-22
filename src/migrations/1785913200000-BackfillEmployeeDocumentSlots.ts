import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Give the migrated employees the eight document slots they were born without.
 *
 * `EmployeeOnboarding` moved nine people across from `admin_profiles` but only
 * created slots for employees filed afterwards, because that happens in
 * `EmployeeService.create()`. The result was a personnel file that answered
 * "no documents" rather than "eight outstanding" — which reads as nothing to
 * do, when in fact nothing had been collected.
 *
 * The invariant is that every employee has exactly eight rows, one per type,
 * from the moment they exist. A checklist whose items only appear once they
 * are done cannot be read for what is missing, and what is missing is the only
 * question anyone asks of an onboarding file.
 *
 * Written with NOT EXISTS so it is safe to run against a database where some
 * or all of the rows are already there.
 */
export class BackfillEmployeeDocumentSlots1785913200000
  implements MigrationInterface
{
  name = 'BackfillEmployeeDocumentSlots1785913200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "employee_documents" ("employee_id", "doc_type", "status")
      SELECT e."id", t."doc_type", 'MISSING'
      FROM "employees" e
      CROSS JOIN (VALUES
        ('CV'), ('EDUCATION'), ('EXPERIENCE'), ('OFFER'),
        ('AADHAAR'), ('PAN'), ('PHOTO'), ('BANK')
      ) AS t("doc_type")
      WHERE NOT EXISTS (
        SELECT 1 FROM "employee_documents" d
        WHERE d."employee_id" = e."id" AND d."doc_type" = t."doc_type"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Only the empty ones. A slot that has since had a file attached or been
     * verified is somebody's work, and reversing a backfill is no reason to
     * throw it away.
     */
    await queryRunner.query(`
      DELETE FROM "employee_documents"
      WHERE "file_id" IS NULL AND "status" = 'MISSING'
    `);
  }
}
