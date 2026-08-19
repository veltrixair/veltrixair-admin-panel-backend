import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Collapses the IT job posting's structured copy into one description.
 *
 * Summary, responsibilities and requirements become sections of
 * `description_mdx`, and the numeric experience range goes entirely —
 * `experience_label` stays, which is the part the card actually prints.
 *
 * `description_mdx` needs no widening: it is already `text`, which in Postgres
 * is unlimited in practice. The request to "make it very large" was already
 * true.
 *
 * The fold happens BEFORE the drop and is the whole point of the migration.
 * All fifteen live postings carry a summary, and fourteen carry both lists —
 * dropping the columns without moving that copy would delete roughly forty
 * pieces of authored content with nothing to recover them from.
 *
 * One consequence worth stating: the careers listing renders `summary` on each
 * card, and its SEO description falls back to it. After this there is no short
 * blurb to render, so a card shows its title and taxonomy alone unless one is
 * reintroduced.
 */
export class FoldJobPostingCopyIntoDescription1785891600000 implements MigrationInterface {
  name = 'FoldJobPostingCopyIntoDescription1785891600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Markdown, because the column already holds MDX and the admin editor
    // renders it — headings and bullets survive the move intact.
    await queryRunner.query(`
      UPDATE "job_postings"
         SET "description_mdx" =
           NULLIF(
             concat_ws(
               E'\\n\\n',
               NULLIF(TRIM(COALESCE("summary", '')), ''),
               NULLIF(TRIM(COALESCE("description_mdx", '')), ''),
               CASE
                 WHEN array_length("responsibilities", 1) > 0
                 THEN '## Responsibilities' || E'\\n' ||
                      (SELECT string_agg('- ' || item, E'\\n')
                         FROM unnest("responsibilities") AS item)
               END,
               CASE
                 WHEN array_length("requirements", 1) > 0
                 THEN '## Requirements' || E'\\n' ||
                      (SELECT string_agg('- ' || item, E'\\n')
                         FROM unnest("requirements") AS item)
               END
             ),
             ''
           )
    `);

    const folded: { n: number }[] = (await queryRunner.query(
      `SELECT count(*)::int AS n FROM "job_postings"
        WHERE "description_mdx" IS NOT NULL AND "description_mdx" <> ''`,
    )) as { n: number }[];
    console.log(
      `  ${folded[0].n} posting(s) now carry their copy in one field`,
    );

    await queryRunner.query(`
      ALTER TABLE "job_postings"
        DROP COLUMN "summary",
        DROP COLUMN "responsibilities",
        DROP COLUMN "requirements",
        DROP COLUMN "experience_min_years",
        DROP COLUMN "experience_max_years"
    `);
  }

  /**
   * Restores the columns but NOT their contents.
   *
   * The fold is one-way: once three fields are concatenated into markdown there
   * is no reliable way to split them back out, and guessing at the boundaries
   * would invent structure rather than recover it. Reverting therefore gives
   * back empty columns and leaves every posting's copy where it now lives — in
   * the description.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_postings"
        ADD COLUMN "summary"              character varying(500),
        ADD COLUMN "responsibilities"     text[] NOT NULL DEFAULT '{}',
        ADD COLUMN "requirements"         text[] NOT NULL DEFAULT '{}',
        ADD COLUMN "experience_min_years" integer,
        ADD COLUMN "experience_max_years" integer
    `);
  }
}
