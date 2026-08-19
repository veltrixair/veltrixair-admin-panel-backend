import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renumbers every master-table code to start at 101, matching the convention
 * used by the organisation's existing backend (gender_masters, country_masters
 * and the rest all begin at 101).
 *
 * A uniform +100 shift is applied to each master and to every column that
 * references one, so all existing relationships are preserved. Foreign keys are
 * dropped and recreated around the update because they are ON DELETE RESTRICT
 * without ON UPDATE CASCADE — a master code cannot change while children still
 * point at the old value.
 *
 * Runs correctly against both an existing database and a fresh one: the earlier
 * migrations seed 1..n, this one shifts the whole set to 101..n+100.
 */
export class RenumberMasterCodesFrom1011785808800000 implements MigrationInterface {
  name = 'RenumberMasterCodesFrom1011785808800000';

  /** Every FK that points at a master code column. */
  private readonly foreignKeys = [
    {
      table: 'country_masters',
      name: 'vtx_country_masters_office_code_fk',
      column: 'office_code',
      references: 'office_masters(office_code)',
    },
    {
      table: 'contact_enquiries',
      name: 'vtx_contact_enquiries_topic_code_fk',
      column: 'topic_code',
      references: 'enquiry_topic_masters(topic_code)',
    },
    {
      table: 'contact_enquiries',
      name: 'vtx_contact_enquiries_country_code_fk',
      column: 'country_code',
      references: 'country_masters(country_code)',
    },
    {
      table: 'contact_enquiries',
      name: 'vtx_contact_enquiries_industry_code_fk',
      column: 'industry_code',
      references: 'industry_masters(industry_code)',
    },
    {
      table: 'contact_enquiries',
      name: 'vtx_contact_enquiries_timeline_code_fk',
      column: 'timeline_code',
      references: 'enquiry_timeline_masters(timeline_code)',
    },
    {
      table: 'contact_enquiries',
      name: 'vtx_contact_enquiries_office_code_fk',
      column: 'office_code',
      references: 'office_masters(office_code)',
    },
    {
      table: 'job_postings',
      name: 'vtx_job_postings_practice_code_fk',
      column: 'practice_code',
      references: 'practice_area_masters(practice_code)',
    },
    {
      table: 'job_postings',
      name: 'vtx_job_postings_office_code_fk',
      column: 'office_code',
      references: 'office_masters(office_code)',
    },
    {
      table: 'job_posting_locations',
      name: 'vtx_job_posting_locations_location_code_fk',
      column: 'location_code',
      references: 'job_location_masters(location_code)',
    },
  ];

  /** Master table -> its own code column. */
  private readonly masters: Array<[string, string]> = [
    ['office_masters', 'office_code'],
    ['country_masters', 'country_code'],
    ['industry_masters', 'industry_code'],
    ['enquiry_topic_masters', 'topic_code'],
    ['enquiry_timeline_masters', 'timeline_code'],
    ['practice_area_masters', 'practice_code'],
    ['job_location_masters', 'location_code'],
  ];

  /** Dependent table -> the columns holding a master code. */
  private readonly dependents: Array<[string, string[]]> = [
    ['country_masters', ['office_code']],
    [
      'contact_enquiries',
      [
        'topic_code',
        'country_code',
        'industry_code',
        'timeline_code',
        'office_code',
      ],
    ],
    ['job_postings', ['practice_code', 'office_code']],
    ['job_posting_locations', ['location_code']],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.shift(queryRunner, 100);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.shift(queryRunner, -100);
  }

  private async shift(queryRunner: QueryRunner, offset: number): Promise<void> {
    const delta = offset >= 0 ? `+ ${offset}` : `- ${Math.abs(offset)}`;

    // 1. Release the constraints so codes can move.
    for (const fk of this.foreignKeys) {
      await queryRunner.query(
        `ALTER TABLE "${fk.table}" DROP CONSTRAINT IF EXISTS "${fk.name}"`,
      );
    }

    // 2. Shift the master codes themselves.
    for (const [table, column] of this.masters) {
      await queryRunner.query(
        `UPDATE "${table}" SET "${column}" = "${column}" ${delta}`,
      );
    }

    // 3. Shift every reference to them. NULLs are left alone — industry and
    //    timeline are optional on an enquiry.
    for (const [table, columns] of this.dependents) {
      for (const column of columns) {
        await queryRunner.query(
          `UPDATE "${table}" SET "${column}" = "${column}" ${delta} WHERE "${column}" IS NOT NULL`,
        );
      }
    }

    // 4. Restore the constraints exactly as they were.
    for (const fk of this.foreignKeys) {
      await queryRunner.query(
        `ALTER TABLE "${fk.table}"
           ADD CONSTRAINT "${fk.name}"
           FOREIGN KEY ("${fk.column}") REFERENCES ${fk.references}
           ON DELETE RESTRICT`,
      );
    }
  }
}
