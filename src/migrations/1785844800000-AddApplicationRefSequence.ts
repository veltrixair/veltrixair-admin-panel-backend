import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The reference-number sequence for job applications.
 *
 * A separate migration because CreateApplicationsModule has already run. A
 * sequence rather than COUNT(*) + 1 for the reason the contact module gives:
 * counting races under concurrent submissions and hands two candidates the
 * same reference.
 *
 * Prefix is VLX-APP so a candidate quoting a reference is immediately
 * distinguishable from an enquiry (VLX) or a discovery booking (VLX-DSC).
 */
export class AddApplicationRefSequence1785844800000 implements MigrationInterface {
  name = 'AddApplicationRefSequence1785844800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE SEQUENCE "job_application_ref_seq" START WITH 1 INCREMENT BY 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP SEQUENCE IF EXISTS "job_application_ref_seq"`,
    );
  }
}
