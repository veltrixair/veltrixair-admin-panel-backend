import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Separates "Remote" from the location taxonomy.
 *
 * "Remote" is a working arrangement, not a place, and it was previously modelled
 * as both — a row in job_location_masters *and* a value of work_mode. That let a
 * role claim a location that does not exist and made the two fields contradict
 * one another (R-004 was linked to Remote while its work_mode said HYBRID).
 *
 * After this migration:
 *   job_location_masters  = cities only (Riyadh, Dubai, Bangalore)
 *   work_mode             = ONSITE | HYBRID | REMOTE
 *
 * Roles keep the cities they can actually be worked from; remote-ness moves to
 * work_mode. R-014 ("Remote (KSA / India)") had no city at all, so it gains
 * Riyadh and Bangalore — the two countries named in its own label.
 */
export class SeparateRemoteFromLocations1785812400000 implements MigrationInterface {
  name = 'SeparateRemoteFromLocations1785812400000';

  private readonly REMOTE_CODE = 104;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Anything linked to the Remote pseudo-location is genuinely remote.
    await queryRunner.query(
      `UPDATE job_postings SET work_mode = 'REMOTE', updated_date = now()
       WHERE id IN (
         SELECT job_posting_id FROM job_posting_locations
         WHERE location_code = ${this.REMOTE_CODE}
       )`,
    );

    // 2. R-014 names two countries in its label but carries no city. Give it
    //    the city in each: Riyadh for KSA, Bangalore for India.
    await queryRunner.query(
      `INSERT INTO job_posting_locations (job_posting_id, location_code)
       SELECT j.id, m.location_code
       FROM job_postings j
       CROSS JOIN job_location_masters m
       WHERE j.ref_code = 'R-014' AND m.location_name IN ('Riyadh', 'Bangalore')
       ON CONFLICT DO NOTHING`,
    );

    // 3. Any other role left with no city falls back to its owning office.
    await queryRunner.query(
      `INSERT INTO job_posting_locations (job_posting_id, location_code)
       SELECT j.id, m.location_code
       FROM job_postings j
       JOIN office_masters o ON o.office_code = j.office_code
       JOIN job_location_masters m ON m.location_name = o.city
       WHERE NOT EXISTS (
         SELECT 1 FROM job_posting_locations l
         WHERE l.job_posting_id = j.id AND l.location_code <> ${this.REMOTE_CODE}
       )
       ON CONFLICT DO NOTHING`,
    );

    // 4. Drop the Remote links, then the Remote row itself. Order matters —
    //    the foreign key is ON DELETE RESTRICT.
    await queryRunner.query(
      `DELETE FROM job_posting_locations WHERE location_code = ${this.REMOTE_CODE}`,
    );
    await queryRunner.query(
      `DELETE FROM job_location_masters WHERE location_code = ${this.REMOTE_CODE}`,
    );
  }

  /**
   * Restores the Remote row and re-links every remote role to it.
   *
   * Approximate by nature: the original work_mode values cannot be recovered
   * exactly, so roles whose label mentions "Remote" alongside a city are
   * returned to HYBRID, which is how they were previously recorded.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO job_location_masters
         (location_code, location_name, slug, display_order)
       VALUES (${this.REMOTE_CODE}, 'Remote', 'remote', 4)
       ON CONFLICT DO NOTHING`,
    );

    await queryRunner.query(
      `INSERT INTO job_posting_locations (job_posting_id, location_code)
       SELECT id, ${this.REMOTE_CODE} FROM job_postings
       WHERE work_mode = 'REMOTE'
       ON CONFLICT DO NOTHING`,
    );

    await queryRunner.query(
      `UPDATE job_postings SET work_mode = 'HYBRID', updated_date = now()
       WHERE work_mode = 'REMOTE' AND location_label LIKE '%/ Remote%'`,
    );

    // R-014 never had a city of its own before this change.
    await queryRunner.query(
      `DELETE FROM job_posting_locations
       WHERE location_code <> ${this.REMOTE_CODE}
         AND job_posting_id IN (SELECT id FROM job_postings WHERE ref_code = 'R-014')`,
    );
  }
}
