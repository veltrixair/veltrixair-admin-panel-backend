import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Re-cuts the experience dropdown into one-year steps.
 *
 *   Fresher · 0–1 · 1–2 · 2–3 · … · 14–15 · 15+
 *
 * WHY THE OLD CODES ARE NOT REUSED, which is the whole care in this file.
 *
 * Code 103 means "1–3 years" to the nineteen applications already filed
 * against it. Pointing it at "1–2 years" would silently rewrite what those
 * candidates told us — they would appear to have said something they never
 * said. So the five bands whose boundaries no longer exist are deactivated
 * rather than relabelled: they stop appearing in the dropdown, keep resolving
 * for the rows that hold them, and the foreign key stays satisfied.
 *
 * Three codes survive untouched because their meaning is identical in both
 * lists — Fresher (101), 0–1 year (102) and 15+ years (108). Retiring and
 * re-adding those would churn working rows for nothing.
 *
 * Labels keep the en dash the existing rows and the website's built-in copy
 * use, so the two still match character for character.
 */
export class OneYearExperienceBands1787558400000 implements MigrationInterface {
  name = 'OneYearExperienceBands1787558400000';

  /** 1–2 … 14–15. Code and display order run together from 109. */
  private readonly newBands = Array.from({ length: 14 }, (_, i) => ({
    code: 109 + i,
    label: `${i + 1}–${i + 2} years`,
    minYears: i + 1,
    displayOrder: 3 + i, // Fresher 1, 0–1 is 2, so these start at 3.
  }));

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The five whose boundaries are gone. Deactivated, never deleted: rows
    // still point at them, and ON DELETE RESTRICT would refuse anyway.
    await queryRunner.query(`
      UPDATE "experience_band_masters"
         SET "is_active" = false
       WHERE "experience_band_code" IN (103, 104, 105, 106, 107)
    `);

    for (const b of this.newBands) {
      await queryRunner.query(
        `INSERT INTO "experience_band_masters"
           ("experience_band_code", "experience_band_name", "min_years",
            "available_for_relevant", "display_order")
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT ("experience_band_code") DO NOTHING`,
        [b.code, b.label, b.minYears, b.displayOrder],
      );
    }

    // 15+ was eighth in the old list and is last in the new one.
    await queryRunner.query(`
      UPDATE "experience_band_masters"
         SET "display_order" = 17
       WHERE "experience_band_code" = 108
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Deleting the new bands would fail for any application that has chosen
     * one — the foreign key is RESTRICT, deliberately. They are deactivated
     * instead, which restores the old dropdown without destroying answers
     * somebody gave.
     */
    await queryRunner.query(`
      UPDATE "experience_band_masters"
         SET "is_active" = false
       WHERE "experience_band_code" BETWEEN 109 AND 122
    `);
    await queryRunner.query(`
      UPDATE "experience_band_masters"
         SET "is_active" = true
       WHERE "experience_band_code" IN (103, 104, 105, 106, 107)
    `);
    await queryRunner.query(`
      UPDATE "experience_band_masters"
         SET "display_order" = 8
       WHERE "experience_band_code" = 108
    `);
  }
}
