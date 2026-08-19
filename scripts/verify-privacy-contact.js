/**
 * End-to-end check of the privacy contact module against a running server.
 *
 *   SUPER_EMAIL=... node scripts/verify-privacy-contact.js <superPassword>
 *
 * Covers the public form, the admin pipeline on feature 110, and — the point of
 * giving privacy its own tables — that none of it reaches or is reached by the
 * IT contact module.
 *
 * The submit route allows five posts per hour per IP and the throttler counts
 * rejected requests too, so this deliberately makes only three.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const SUPER = {
  email: process.env.SUPER_EMAIL || 'admin@veltrixair.com',
  password: process.argv[2],
};

const PRIVACY_SITE = 103;
const IT_SITE = 101;
const SUPER_ADMIN = 101;

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}  ->  ${detail}`);
  }
}

const json = async (path, options = {}) => {
  const res = await fetch(BASE + path, options);
  return { status: res.status, body: await res.json() };
};

const post = (path, body, headers = {}) =>
  json(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const patch = (path, body, token) =>
  json(path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

const brief = (over = {}) => ({
  fullName: 'Verification Probe',
  organisation: 'Gulf Retail Group',
  workEmail: `pv-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
  phone: '+966 55 000 0000',
  roleTitle: 'Head of Legal',
  jurisdictionCode: 301,
  serviceCode: 303,
  brief: 'We need a DPIA across three customer-facing systems before launch.',
  ...over,
});

(async () => {
  if (!SUPER.password) {
    console.error('Pass the super admin password as the first argument.');
    process.exit(1);
  }

  console.log('\nPublic form');
  const options = await json('/privacy/contact-options', {
    headers: { 'X-Site-Code': String(PRIVACY_SITE) },
  });
  const o = options.body.data ?? {};
  check(
    'serves 6 jurisdictions and 7 services',
    o.jurisdictions?.length === 6 && o.services?.length === 7,
    JSON.stringify({ j: o.jurisdictions?.length, s: o.services?.length }),
  );
  check(
    'jurisdiction labels carry the regulation',
    o.jurisdictions?.some((j) => j.label === 'KSA — Saudi Arabia — PDPL'),
    JSON.stringify(o.jurisdictions?.[0]),
  );

  const created = await post('/privacy/enquiries', brief(), {
    'X-Site-Code': String(PRIVACY_SITE),
  });
  check(
    'submits with no consent field at all',
    created.status === 201 && /^VDP-ENQ-/.test(created.body.data?.referenceNo),
    `${created.status} ${JSON.stringify(created.body.data ?? created.body.message)}`,
  );
  const reference = created.body.data?.referenceNo;

  const badJurisdiction = await post(
    '/privacy/enquiries',
    brief({ jurisdictionCode: 999 }),
    { 'X-Site-Code': String(PRIVACY_SITE) },
  );
  check(
    'an unknown jurisdiction is a 404',
    badJurisdiction.status === 404,
    `${badJurisdiction.status} ${badJurisdiction.body.message}`,
  );

  console.log('\nAdmin — privacy dashboard');
  const privacyLogin = await post('/admin/auth/login', {
    ...SUPER,
    siteCode: PRIVACY_SITE,
    roleCode: SUPER_ADMIN,
  });
  check(
    'super admin can sign in to site 103',
    privacyLogin.status === 200,
    `${privacyLogin.status} ${privacyLogin.body.message}`,
  );
  const privacyToken = privacyLogin.body.data?.accessToken;

  const list = await json('/admin/privacy-enquiries', auth(privacyToken));
  const items = list.body.data?.items ?? [];
  check(
    'lists enquiries including the restored ones',
    list.status === 200 && items.length >= 3,
    `${list.status} ${items.length} item(s)`,
  );
  check(
    'the restored submissions survived the rebuild',
    items.some((e) => e.referenceNo === 'VLX-2026-000021') &&
      items.some((e) => e.referenceNo === 'VLX-2026-000022'),
    JSON.stringify(items.map((e) => e.referenceNo)),
  );
  check(
    'the list withholds the brief and phone',
    items.every((e) => e.brief === undefined && e.phone === undefined),
    JSON.stringify(Object.keys(items[0] ?? {})),
  );

  const mine = items.find((e) => e.referenceNo === reference);
  const detail = await json(
    `/admin/privacy-enquiries/${mine.id}`,
    auth(privacyToken),
  );
  const d = detail.body.data ?? {};
  check(
    'the detail record returns the brief and phone',
    typeof d.brief === 'string' && typeof d.phone === 'string',
    JSON.stringify({ brief: typeof d.brief, phone: typeof d.phone }),
  );
  check(
    'lawful basis is legitimate interest with no consent timestamp',
    d.lawfulBasis === 'LEGITIMATE_INTEREST' && d.consentAt === null,
    JSON.stringify({ basis: d.lawfulBasis, consentAt: d.consentAt }),
  );
  check(
    'routed to info@ on the Riyadh calendar',
    d.routedToEmail === 'info@veltrixair.com' && d.officeCode === 301,
    JSON.stringify({ to: d.routedToEmail, office: d.officeCode }),
  );

  console.log('\nAssignment carries its timestamp');
  const assigned = await patch(
    `/admin/privacy-enquiries/${mine.id}/assign`,
    { assignedTo: 'privacy.lead@veltrixair.com' },
    privacyToken,
  );
  check(
    'assigning sets assignedAt',
    assigned.body.data?.assignedTo === 'privacy.lead@veltrixair.com' &&
      !!assigned.body.data?.assignedAt,
    JSON.stringify({
      to: assigned.body.data?.assignedTo,
      at: assigned.body.data?.assignedAt,
    }),
  );

  const unassigned = await patch(
    `/admin/privacy-enquiries/${mine.id}/assign`,
    { assignedTo: null },
    privacyToken,
  );
  check(
    'unassigning clears both together',
    unassigned.body.data?.assignedTo === null &&
      unassigned.body.data?.assignedAt === null,
    JSON.stringify({
      to: unassigned.body.data?.assignedTo,
      at: unassigned.body.data?.assignedAt,
    }),
  );

  const statused = await patch(
    `/admin/privacy-enquiries/${mine.id}/status`,
    { status: 'IN_PROGRESS', note: 'Scoping call booked.' },
    privacyToken,
  );
  check(
    'first move off NEW stops the SLA clock',
    statused.body.data?.status === 'IN_PROGRESS' &&
      !!statused.body.data?.firstRespondedAt,
    JSON.stringify({
      status: statused.body.data?.status,
      responded: statused.body.data?.firstRespondedAt,
    }),
  );

  const events = await json(
    `/admin/privacy-enquiries/${mine.id}/events`,
    auth(privacyToken),
  );
  const types = (events.body.data ?? []).map((e) => e.eventType);
  check(
    'the timeline records created, assigned, unassigned and status',
    ['CREATED', 'ASSIGNED', 'UNASSIGNED', 'STATUS_CHANGED'].every((t) =>
      types.includes(t),
    ),
    JSON.stringify(types),
  );

  console.log('\nSeparation from the IT contact module');
  const itLogin = await post('/admin/auth/login', {
    ...SUPER,
    siteCode: IT_SITE,
    roleCode: SUPER_ADMIN,
  });
  const itToken = itLogin.body.data?.accessToken;

  const itReadsPrivacy = await json(
    `/admin/privacy-enquiries/${mine.id}`,
    auth(itToken),
  );
  check(
    'an IT-dashboard token cannot read a privacy enquiry',
    itReadsPrivacy.status === 403 || itReadsPrivacy.status === 404,
    `${itReadsPrivacy.status} ${itReadsPrivacy.body.message}`,
  );

  const itContacts = await json('/admin/contact/enquiries', auth(itToken));
  const itRefs = (itContacts.body.data?.items ?? []).map((e) => e.referenceNo);
  check(
    'the IT contact list no longer contains any privacy enquiry',
    !itRefs.includes('VLX-2026-000021') && !itRefs.includes('VLX-2026-000022'),
    JSON.stringify(itRefs),
  );

  const itOptions = await json('/contact/form-options', {
    headers: { 'X-Site-Code': String(IT_SITE) },
  });
  check(
    'the IT contact form is untouched by all of this',
    itOptions.status === 200 &&
      itOptions.body.data?.topics?.length > 0 &&
      itOptions.body.data?.jurisdictions === undefined,
    JSON.stringify({
      topics: itOptions.body.data?.topics?.length,
      jurisdictions: itOptions.body.data?.jurisdictions,
    }),
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`created: ${reference}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
