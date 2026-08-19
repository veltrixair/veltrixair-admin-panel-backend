/**
 * Proves one brand's data never reaches another brand's dashboard.
 *
 *   node scripts/verify-site-isolation.js <itSuperPassword> <craneSuperPassword>
 *
 * Two halves, because there are two independent mechanisms and both have to
 * hold:
 *
 *   1. SCHEMA COMPLETENESS — every table that should carry a brand does.
 *      This is the check that catches the table someone adds next year and
 *      forgets to scope, long before it holds anything real.
 *
 *   2. RUNTIME ISOLATION — seed a row on each brand, then confirm an admin
 *      signed in to one sees exactly their own.
 *
 * The first is cheap and never goes stale. The second is what actually proves
 * the WHERE clauses landed.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const IT = { email: process.env.IT_EMAIL, password: process.argv[2], site: 101 };
const CRANE = {
  email: process.env.CRANE_EMAIL,
  password: process.argv[3],
  site: 102,
};

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { body, token, site } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(site ? { 'X-Site-Code': String(site) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    /* empty */
  }
  return { status: response.status, body: json };
}

async function login({ email, password, site }) {
  let r = await call('POST', '/admin/auth/login', {
    body: { email, password, siteCode: site, roleCode: 101 },
  });
  if (r.status === 429) {
    console.log('        (login throttle — waiting 61s)');
    await sleep(61_000);
    r = await call('POST', '/admin/auth/login', {
      body: { email, password, siteCode: site, roleCode: 101 },
    });
  }
  if (r.status !== 200) {
    throw new Error(`Cannot sign in as ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body.data.accessToken;
}

function db() {
  require('dotenv').config({ path: 'config/dev.env' });
  const { Client } = require('pg');
  return new (require('pg').Client)({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

/**
 * Tables that hold one brand's data and must therefore carry `site_code`.
 *
 * Event tables are deliberately absent: they are always reached through a
 * parent that is itself scoped, and a duplicated column could drift from it.
 * Join tables likewise inherit their parent's brand.
 */
const MUST_BE_SCOPED = [
  'contact_enquiries',
  'job_postings',
  'articles',
  'job_applications',
  'discovery_bookings',
  'architects',
  'session_slots',
  'architect_availability_rules',
  'architect_blackouts',
  'stored_files',
  'asset_download_requests',
  'crane_quote_requests',
  'admin_roles',
  // Lookup lists whose contents differ per brand
  'enquiry_topic_masters',
  'practice_area_masters',
  'article_topic_masters',
  'article_type_masters',
  'job_location_masters',
  'office_masters',
  'discovery_practice_masters',
  'industry_masters',
];

(async () => {
  if (!IT.password || !CRANE.password || !IT.email || !CRANE.email) {
    throw new Error(
      'Usage: IT_EMAIL=… CRANE_EMAIL=… node scripts/verify-site-isolation.js <itPw> <cranePw>',
    );
  }

  console.log('\n1. Schema completeness\n');

  const client = db();
  await client.connect();

  const scoped = await client.query(
    `SELECT table_name, is_nullable FROM information_schema.columns
     WHERE column_name = 'site_code' AND table_schema = 'public'`,
  );
  const have = new Map(scoped.rows.map((r) => [r.table_name, r.is_nullable]));

  const missing = MUST_BE_SCOPED.filter((t) => !have.has(t));
  check(
    `all ${MUST_BE_SCOPED.length} scoped tables carry site_code`,
    missing.length === 0,
    missing.join(', '),
  );

  const nullable = MUST_BE_SCOPED.filter((t) => have.get(t) === 'YES');
  check(
    'site_code is NOT NULL everywhere it exists',
    nullable.length === 0,
    nullable.join(', '),
  );

  const noFk = await client.query(
    `SELECT c.table_name FROM information_schema.columns c
     WHERE c.column_name = 'site_code' AND c.table_schema = 'public'
       AND c.table_name <> 'site_masters'
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.key_column_usage k
         JOIN information_schema.table_constraints tc
           ON tc.constraint_name = k.constraint_name
         WHERE k.table_name = c.table_name AND k.column_name = 'site_code'
           AND tc.constraint_type = 'FOREIGN KEY'
       )`,
  );
  check(
    'every site_code is a real foreign key',
    noFk.rowCount === 0,
    noFk.rows.map((r) => r.table_name).join(', '),
  );

  console.log('\n2. Seeding one enquiry per brand\n');

  const stamp = Date.now();
  await client.query(
    `INSERT INTO contact_enquiries
       (reference_no, site_code, topic_code, full_name, company, work_email,
        country_code, message, consent_at, privacy_notice_version, status,
        office_code, routed_to_email, sla_due_at)
     VALUES
       ($1, 101, 101, 'IT Isolation Probe', 'IT Co', $2, 101,
        'IT side probe.', now(), 'probe', 'NEW', 101, 'probe@veltrixair.com', now()),
       ($3, 102, 101, 'Crane Isolation Probe', 'Crane Co', $4, 101,
        'Crane side probe.', now(), 'probe', 'NEW', 101, 'probe@veltrixair.com', now())`,
    [
      `PROBE-IT-${stamp}`,
      `it-probe-${stamp}@example.com`,
      `PROBE-CR-${stamp}`,
      `crane-probe-${stamp}@example.com`,
    ],
  );
  check('two probe enquiries seeded, one per brand', true);

  console.log('\n3. Runtime isolation — admin surface\n');

  const itToken = await login(IT);
  const craneToken = await login(CRANE);

  const itList = await call('GET', '/admin/contact/enquiries?limit=100', {
    token: itToken,
  });
  const craneList = await call('GET', '/admin/contact/enquiries?limit=100', {
    token: craneToken,
  });

  const itRefs = (itList.body?.data?.items ?? []).map((e) => e.referenceNo);
  const craneRefs = (craneList.body?.data?.items ?? []).map((e) => e.referenceNo);

  check('IT admin sees the IT probe', itRefs.includes(`PROBE-IT-${stamp}`));
  check(
    'IT admin does NOT see the crane probe',
    !itRefs.includes(`PROBE-CR-${stamp}`),
    'CROSS-BRAND LEAK',
  );
  check('crane admin sees the crane probe', craneRefs.includes(`PROBE-CR-${stamp}`));
  check(
    'crane admin does NOT see the IT probe',
    !craneRefs.includes(`PROBE-IT-${stamp}`),
    'CROSS-BRAND LEAK',
  );

  console.log('\n4. Reading another brand by id\n');

  const craneRow = await client.query(
    'SELECT id FROM contact_enquiries WHERE reference_no = $1',
    [`PROBE-CR-${stamp}`],
  );
  const craneId = craneRow.rows[0].id;

  const crossRead = await call(`GET`, `/admin/contact/enquiries/${craneId}`, {
    token: itToken,
  });
  check(
    'IT admin fetching a crane enquiry by id → 404',
    crossRead.status === 404,
    `got ${crossRead.status}`,
  );

  const crossPatch = await call('PATCH', `/admin/contact/enquiries/${craneId}/status`, {
    token: itToken,
    body: { status: 'QUALIFYING' },
  });
  check(
    'IT admin cannot change a crane enquiry → 404',
    crossPatch.status === 404,
    `got ${crossPatch.status}`,
  );

  const crossEvents = await call('GET', `/admin/contact/enquiries/${craneId}/events`, {
    token: itToken,
  });
  check(
    'IT admin cannot read a crane timeline → 404',
    crossEvents.status === 404,
    `got ${crossEvents.status}`,
  );

  console.log('\n5. Public surface resolves its own brand\n');

  const itOptions = await call('GET', '/contact/form-options', { site: 101 });
  const craneOptions = await call('GET', '/contact/form-options', { site: 102 });
  check('IT form options → 200', itOptions.status === 200, `got ${itOptions.status}`);
  check(
    'crane form options → 200',
    craneOptions.status === 200,
    `got ${craneOptions.status}`,
  );
  check(
    'the two brands get different industry lists',
    JSON.stringify(itOptions.body?.data?.industries) !==
      JSON.stringify(craneOptions.body?.data?.industries),
  );
  check(
    'IT industries are the 1xx range',
    (itOptions.body?.data?.industries ?? []).every((i) => i.code < 200),
  );
  check(
    'crane industries are the 2xx range',
    (craneOptions.body?.data?.industries ?? []).every(
      (i) => i.code >= 200 && i.code < 300,
    ),
  );

  const unknownSite = await call('GET', '/contact/form-options', { site: 999 });
  check(
    'an unknown site header → 400, not a silent default',
    unknownSite.status === 400,
    `got ${unknownSite.status}`,
  );

  await client.query('DELETE FROM contact_enquiries WHERE reference_no LIKE $1', [
    `PROBE-%-${stamp}`,
  ]);
  await client.end();
  console.log('\n  probes cleaned up');

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
});
