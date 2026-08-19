/**
 * Dumps the site-103 enquiries out of the shared contact table before the
 * shared-contact migration is reverted.
 *
 *   node scripts/export-privacy-enquiries.js
 *
 * The revert restores NOT NULL on consent_at, and these rows have no consent
 * timestamp by design — so the revert deletes them. They are real submissions,
 * so they are written to docs/privacy-enquiries.export.json and re-seeded into
 * privacy_contact_enquiries once that table exists.
 *
 * Selects the withheld columns explicitly: message and phone are select:false
 * on the entity, so reading these through TypeORM would silently drop them.
 * This goes straight to SQL for that reason.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'docs', 'privacy-enquiries.export.json');

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, 'config', 'dev.env'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);

(async () => {
  const db = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await db.connect();

  // The master rows are joined in rather than left as bare codes: after the
  // revert those tables are gone, so the codes alone would not be resolvable
  // when this file is read back.
  const enquiries = await db.query(`
    SELECT e.*,
           j.jurisdiction_name, j.regulation,
           t.topic_name, t.route_email,
           o.office_name
      FROM contact_enquiries e
      LEFT JOIN jurisdiction_masters  j ON j.jurisdiction_code = e.jurisdiction_code
      LEFT JOIN enquiry_topic_masters t ON t.topic_code = e.topic_code
      LEFT JOIN office_masters        o ON o.office_code = e.office_code
     WHERE e.site_code = 103
     ORDER BY e.created_date
  `);

  const events = await db.query(
    `SELECT * FROM contact_enquiry_events
      WHERE enquiry_id IN (SELECT id FROM contact_enquiries WHERE site_code = 103)
      ORDER BY created_date`,
  );

  fs.writeFileSync(
    OUTPUT,
    `${JSON.stringify(
      { enquiries: enquiries.rows, events: events.rows },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
  for (const e of enquiries.rows) {
    console.log(
      `  ${e.reference_no}  ${e.full_name} <${e.work_email}>  ` +
        `${e.jurisdiction_name ?? '?'} / ${e.topic_name ?? '?'}  ` +
        `message=${e.message ? `${e.message.length} chars` : 'MISSING'}`,
    );
  }
  console.log(`  ${events.rowCount} timeline event(s)`);

  await db.end();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
