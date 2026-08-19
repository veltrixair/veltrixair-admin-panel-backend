/**
 * Puts the exported enquiries back, into the new privacy table.
 *
 *   node scripts/reseed-privacy-enquiries.js
 *
 * Reads docs/privacy-enquiries.export.json, written before the shared-contact
 * migration was reverted. Maps the old columns onto the new ones and keeps the
 * original reference numbers and timestamps, so the two real submissions read
 * as what they are rather than as fresh test data.
 *
 * Idempotent — an enquiry already present by reference number is skipped.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'docs', 'privacy-enquiries.export.json');

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

/** Old topic codes and the privacy service codes they became. */
const SERVICE_BY_TOPIC = {
  301: 301,
  302: 302,
  303: 303,
  304: 304,
  305: 305,
  306: 306,
  307: 307,
};

/**
 * The shared table ran a sales pipeline; this one runs a practice's.
 *
 * Mapped rather than passed through, because the new CHECK constraint would
 * otherwise reject QUALIFYING and the two brands' vocabularies genuinely
 * differ — "won" and "lost" mean nothing to a privacy brief.
 */
const STATUS_MAP = {
  NEW: 'NEW',
  QUALIFYING: 'IN_PROGRESS',
  ENGAGED: 'IN_PROGRESS',
  WON: 'RESOLVED',
  LOST: 'CLOSED',
  SPAM: 'SPAM',
};

(async () => {
  const { enquiries, events } = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));

  const db = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await db.connect();

  let inserted = 0;
  let skipped = 0;

  for (const e of enquiries) {
    const existing = await db.query(
      'SELECT id FROM privacy_contact_enquiries WHERE reference_no = $1',
      [e.reference_no],
    );
    if (existing.rowCount) {
      skipped += 1;
      continue;
    }

    const serviceCode = SERVICE_BY_TOPIC[e.topic_code];
    if (!serviceCode) {
      throw new Error(
        `${e.reference_no}: topic ${e.topic_code} has no privacy service equivalent`,
      );
    }

    const status = STATUS_MAP[e.status];
    if (!status) {
      throw new Error(`${e.reference_no}: no mapping for status ${e.status}`);
    }

    const row = await db.query(
      `INSERT INTO privacy_contact_enquiries
         (site_code, reference_no, full_name, organisation, work_email, phone, role_title,
          jurisdiction_code, service_code, brief,
          lawful_basis, consent_at, privacy_notice_version,
          office_code, routed_to_email, sla_due_at, first_responded_at,
          status, assigned_to, assigned_at,
          source_page, utm_source, utm_medium, utm_campaign,
          ip_hash, user_agent, spam_score, created_date, updated_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
               $21,$22,$23,$24,$25,$26,$27,$28,$29)
       RETURNING id`,
      [
        103,
        e.reference_no,
        e.full_name,
        // "company" on the shared table is "organisation" on this one.
        e.company,
        e.work_email,
        e.phone,
        e.role_title,
        e.jurisdiction_code,
        serviceCode,
        // "message" became "brief".
        e.message,
        e.lawful_basis ?? 'LEGITIMATE_INTEREST',
        e.consent_at,
        e.privacy_notice_version,
        e.office_code,
        e.routed_to_email,
        e.sla_due_at,
        e.first_responded_at,
        status,
        e.assigned_to,
        // The old table had no assigned_at; a CHECK here requires the two to
        // agree, so an already-assigned row is backdated to when it was created.
        e.assigned_to ? e.created_date : null,
        e.source_page,
        e.utm_source,
        e.utm_medium,
        e.utm_campaign,
        e.ip_hash,
        e.user_agent,
        e.spam_score,
        e.created_date,
        e.updated_date,
      ],
    );

    const newId = row.rows[0].id;
    for (const ev of events.filter((x) => x.enquiry_id === e.id)) {
      await db.query(
        `INSERT INTO privacy_contact_events
           (enquiry_id, event_type, actor, note, metadata, created_date)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [newId, ev.event_type, ev.actor, ev.note, ev.metadata, ev.created_date],
      );
    }

    inserted += 1;
    console.log(`  restored ${e.reference_no}  (${e.full_name})`);
  }

  // The sequence must not hand out a number already taken by a restored row.
  const highest = await db.query(
    `SELECT max(substring("reference_no" from '[0-9]+$')::int) AS n
       FROM privacy_contact_enquiries`,
  );
  if (highest.rows[0].n) {
    await db.query(
      `SELECT setval('privacy_contact_ref_seq', $1)`,
      [highest.rows[0].n],
    );
    console.log(`  sequence advanced past ${highest.rows[0].n}`);
  }

  console.log(`\n${inserted} restored, ${skipped} already present`);
  await db.end();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
