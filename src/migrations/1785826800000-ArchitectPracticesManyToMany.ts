import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets an architect cover more than one practice.
 *
 * The original model put a single `practice_code` on `architects`, which meant
 * a practice could have several architects but not the reverse. In this firm
 * the disciplines overlap — Cybersecurity & SOC and Data Privacy in particular
 * — so a senior practitioner may genuinely serve both.
 *
 * Existing assignments are preserved: each architect's current practice becomes
 * its first row in the join table.
 */
export class ArchitectPracticesManyToMany1785826800000 implements MigrationInterface {
  name = 'ArchitectPracticesManyToMany1785826800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "architect_practices" (
        "architect_id"  uuid NOT NULL,
        "practice_code" integer NOT NULL,
        CONSTRAINT "vtx_architect_practices_pk" PRIMARY KEY ("architect_id","practice_code")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "architect_practices"
        ADD CONSTRAINT "vtx_architect_practices_architect_id_fk"
        FOREIGN KEY ("architect_id") REFERENCES "architects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "architect_practices"
        ADD CONSTRAINT "vtx_architect_practices_practice_code_fk"
        FOREIGN KEY ("practice_code") REFERENCES "discovery_practice_masters"("practice_code")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_architect_practices_practice_code" ON "architect_practices" ("practice_code")`,
    );

    // Carry every current assignment across before the column disappears.
    await queryRunner.query(`
      INSERT INTO "architect_practices" ("architect_id","practice_code")
      SELECT id, practice_code FROM "architects"
    `);

    await queryRunner.query(
      `ALTER TABLE "architects" DROP CONSTRAINT IF EXISTS "vtx_architects_practice_code_fk"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_architects_practice_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "architects" DROP COLUMN IF EXISTS "practice_code"`,
    );
  }

  /**
   * Collapses back to one practice per architect. Lossy by nature: an architect
   * covering several keeps the lowest-numbered one.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "architects" ADD COLUMN "practice_code" integer`,
    );
    await queryRunner.query(`
      UPDATE "architects" a
      SET practice_code = (
        SELECT min(practice_code) FROM "architect_practices" p
        WHERE p.architect_id = a.id
      )
    `);
    // Anything left unassigned falls back to the first practice so the column
    // can be made NOT NULL again.
    await queryRunner.query(
      `UPDATE "architects" SET practice_code = 101 WHERE practice_code IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "architects" ALTER COLUMN "practice_code" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "architects" ADD CONSTRAINT "vtx_architects_practice_code_fk"
      FOREIGN KEY ("practice_code") REFERENCES "discovery_practice_masters"("practice_code")
      ON DELETE RESTRICT
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_architects_practice_code" ON "architects" ("practice_code")`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "architect_practices"`);
  }
}
