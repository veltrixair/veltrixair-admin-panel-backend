/**
 * Checks that SWL capacity accepts what a maintenance manager actually writes.
 *
 *   CRANE_PW=... node scripts/verify-swl-capacity.js
 *
 * The column was numeric(8,2), written when the schema assumed one crane per
 * request. It never was: `crane_count` has always been on the same form, and a
 * six-crane inspection request carries several capacities. "10 + 20 + 32 t"
 * was rejected by the validation pipe, so the request never arrived at all.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CRANE = {
  email: process.env.CRANE_EMAIL || 'crane.admin@veltrixair.com',
  password: process.env.CRANE_PW,
  siteCode: 102,
};
const SUPER_ADMIN = 101;

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}  ->  ${detail}`);
  }
};

const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Site-Code': '102',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
};

const stamp = Date.now();

/** The quote from the admin screen, as the public form would send it. */
const quoteBody = (swl, email) => ({
  serviceLineCode: 105,
  urgencyCode: 202,
  leadSourceCode: 204,
  companyName: 'Jubail Steel Fabrication Co.',
  industryCode: 103,
  contactName: 'Verification Probe',
  contactPosition: 'Maintenance Manager',
  businessEmail: email,
  mobile: '+966 55 812 4407',
  existingClient: 'NO',
  preferredContact: 'WHATSAPP',
  siteCityCode: 203,
  siteAccessCode: 202,
  craneCount: 6,
  craneTypeCode: 201,
  oemCode: 202,
  swlTonnes: swl,
  yearOfManufacture: 2011,
  environmentCode: 201,
  spanLiftHeight: '22 m span · 9 m lift',
  dutyClassCode: 202,
  budgetBandCode: 202,
  completionTimelineCode: 202,
  procurementCode: 202,
  paymentTermsCode: 201,
  projectDescription:
    'Six EOT cranes overdue statutory inspection after a plant acquisition.',
  constraintsConcerns: 'Night-shift access only on lines 2 and 3.',
  consentGiven: true,
});

(async () => {
  if (!CRANE.password) {
    console.error('Set CRANE_PW.');
    process.exit(1);
  }

  const login = await call('POST', '/admin/auth/login', {
    ...CRANE,
    roleCode: SUPER_ADMIN,
  });
  if (login.status !== 200) {
    console.error('could not sign in:', login.status, login.body.message);
    process.exit(1);
  }
  const token = login.body.data.accessToken;

  console.log('\nSubmitting');

  const multi = await call(
    'POST',
    '/crane/quotes',
    quoteBody('10 + 20 + 32 t', `swl-multi-${stamp}@example.com`),
  );
  check(
    'a multi-crane capacity is accepted',
    multi.status === 201,
    `${multi.status} ${JSON.stringify(multi.body.message ?? multi.body.data)}`,
  );

  const single = await call(
    'POST',
    '/crane/quotes',
    quoteBody('32 t', `swl-single-${stamp}@example.com`),
  );
  check(
    'a single capacity still works',
    single.status === 201,
    `${single.status} ${single.body.message}`,
  );

  const tooLong = await call(
    'POST',
    '/crane/quotes',
    quoteBody('x'.repeat(151), `swl-long-${stamp}@example.com`),
  );
  check(
    'past 150 characters is refused',
    tooLong.status === 400,
    `${tooLong.status} ${tooLong.body.message}`,
  );

  console.log('\nReading it back');

  const list = await call('GET', '/admin/crane-quotes?limit=50', null, token);
  const row = (list.body.data?.items ?? []).find(
    (q) => q.referenceNo === multi.body.data?.referenceNo,
  );
  check(
    'the new quote is on the pipeline',
    !!row,
    JSON.stringify(multi.body.data?.referenceNo),
  );

  const detail = row
    ? await call('GET', `/admin/crane-quotes/${row.id}`, null, token)
    : { body: {} };
  check(
    'the detail screen shows it exactly as written',
    detail.body.data?.swlTonnes === '10 + 20 + 32 t',
    JSON.stringify(detail.body.data?.swlTonnes),
  );

  console.log('\nWhat the migration did to existing rows');

  const older = (list.body.data?.items ?? [])
    .map((q) => q.swlTonnes)
    .filter((v) => v !== null && v !== undefined);
  check(
    'converted values carry no invented decimals',
    !older.some((v) => /\.00$/.test(String(v))),
    JSON.stringify(older.slice(0, 8)),
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    `created for cleanup: ${multi.body.data?.referenceNo}, ${single.body.data?.referenceNo}`,
  );
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
