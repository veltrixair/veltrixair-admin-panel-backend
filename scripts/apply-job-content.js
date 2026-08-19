/**
 * Applies the reviewed long-form copy in docs/job-descriptions.draft.json to
 * the job_postings table.
 *
 *   node scripts/apply-job-content.js            preview only (default)
 *   node scripts/apply-job-content.js --apply    write to the database
 *
 * Preview is the default on purpose: this writes content that appears on the
 * public careers site, so applying it has to be a deliberate act.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({
  path:
    process.env.NODE_ENV === 'production'
      ? 'config/prod.env'
      : 'config/dev.env',
});
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const DRAFT = path.resolve(__dirname, '..', 'docs', 'job-descriptions.draft.json');

(async () => {
  const draft = JSON.parse(fs.readFileSync(DRAFT, 'utf8'));
  const jobs = draft.jobs ?? [];

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  // Every ref code in the draft must exist before anything is written.
  const existing = await client.query(
    'SELECT ref_code, title FROM job_postings WHERE is_deleted = false',
  );
  const known = new Map(existing.rows.map((r) => [r.ref_code, r.title]));
  const missing = jobs.filter((j) => !known.has(j.refCode)).map((j) => j.refCode);

  if (missing.length) {
    console.error(`Unknown ref codes in draft: ${missing.join(', ')}`);
    await client.end();
    process.exit(1);
  }

  console.log(APPLY ? 'APPLYING\n' : 'PREVIEW — nothing will be written\n');

  let applied = 0;
  for (const job of jobs) {
    const respCount = (job.responsibilities ?? []).length;
    const reqCount = (job.requirements ?? []).length;
    const words = (job.descriptionMdx ?? '').split(/\s+/).filter(Boolean).length;

    console.log(
      `  ${job.refCode}  ${known.get(job.refCode).slice(0, 46).padEnd(48)}` +
        `${String(words).padStart(4)}w  ${respCount} resp  ${reqCount} req  ` +
        `visa=${job.visaSponsorship === null ? 'null' : job.visaSponsorship}`,
    );

    if (!APPLY) continue;

    await client.query(
      `UPDATE job_postings SET
         summary = $2,
         description_mdx = $3,
         responsibilities = $4,
         requirements = $5,
         visa_sponsorship = $6,
         seo_description = $7,
         updated_date = now()
       WHERE ref_code = $1 AND is_deleted = false`,
      [
        job.refCode,
        job.summary ?? null,
        job.descriptionMdx ?? null,
        job.responsibilities ?? [],
        job.requirements ?? [],
        job.visaSponsorship,
        job.seoDescription ?? null,
      ],
    );
    applied++;
  }

  if (APPLY) {
    const check = await client.query(
      `SELECT count(*)::int AS n FROM job_postings
       WHERE is_deleted = false
         AND (description_mdx IS NOT NULL
              OR array_length(responsibilities, 1) > 0
              OR array_length(requirements, 1) > 0)`,
    );
    console.log(`\n${applied} roles updated.`);
    console.log(`${check.rows[0].n} roles now have long-form content (contentPending = false).`);
  } else {
    console.log(`\n${jobs.length} roles ready. Re-run with --apply to write them.`);
  }

  await client.end();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
