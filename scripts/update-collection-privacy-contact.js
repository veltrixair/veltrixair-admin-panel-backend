/**
 * Adds the Privacy folder to the Postman collection.
 *
 *   node scripts/update-collection-privacy-contact.js
 *
 * Top-level, beside Crane Quotes and Crane Site Visits, because the privacy
 * practice now has its own module, tables and feature code rather than riding
 * on the shared contact pipeline. An earlier version nested these under
 * Contact; that folder is removed here.
 *
 * There is no sign-in request of its own — Auth / Login already takes
 * {{siteCode}} and {{roleCode}}, so reaching this dashboard means setting
 * {{siteCode}} to 103 and running it.
 *
 * Idempotent — re-running replaces the folder rather than duplicating it.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.resolve(
  __dirname,
  '..',
  'docs',
  'veltrixair.postman_collection.json',
);
const collection = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const FOLDER = 'Privacy';
const SITE_HEADER = { key: 'X-Site-Code', value: '103' };

for (const v of [
  { key: 'privacyEnquiryId', value: '', type: 'string' },
  { key: 'privacyReference', value: '', type: 'string' },
]) {
  if (!collection.variable.find((x) => x.key === v.key)) {
    collection.variable.push(v);
  }
}

// Left behind by the version that had its own login.
collection.variable = collection.variable.filter(
  (v) => v.key !== 'privacyAccessToken',
);

const script = (lines) => ({
  listen: 'test',
  script: { type: 'text/javascript', exec: lines },
});

const request = (name, method, urlPath, body, description, opts = {}) => ({
  name,
  ...(opts.tests ? { event: [script(opts.tests)] } : {}),
  request: {
    method,
    // Admin routes are excluded from the site middleware — the brand comes from
    // the badge in the token, not from a header. Only public requests carry one.
    header: [
      ...(opts.admin ? [] : [SITE_HEADER]),
      ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : []),
    ],
    ...(body
      ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } }
      : {}),
    url: {
      raw: `{{baseUrl}}/${urlPath}`,
      host: ['{{baseUrl}}'],
      path: urlPath.split('/'),
    },
    description,
  },
  response: [],
});

const SIGN_IN_FIRST =
  'Sign in first: set {{siteCode}} to 103, then run Auth / Login. Site and role ' +
  'are chosen at sign-in, so the token is what scopes this to the privacy ' +
  'practice — a token for another dashboard is refused with 403.\n\n';

const publicItems = [
  request(
    'Contact options',
    'GET',
    'privacy/contact-options',
    null,
    'The two dropdowns on "Brief the practice": 6 jurisdictions, each labelled ' +
      'with the regulation that applies, and the 7 privacy services.',
    {
      tests: [
        'const d = pm.response.json().data;',
        "pm.test('200 OK', () => pm.response.to.have.status(200));",
        "pm.test('6 jurisdictions', () => pm.expect(d.jurisdictions).to.have.lengthOf(6));",
        "pm.test('7 services', () => pm.expect(d.services).to.have.lengthOf(7));",
      ],
    },
  ),
  request(
    'Brief the practice',
    'POST',
    'privacy/enquiries',
    {
      fullName: 'Aisha Rahman',
      organisation: 'Gulf Retail Group',
      workEmail: 'aisha.rahman@example.com',
      phone: '+966 55 000 0000',
      roleTitle: 'Head of Legal',
      jurisdictionCode: 301,
      serviceCode: 303,
      brief:
        'We need a DPIA across three customer-facing systems before launch.',
    },
    'No consent field — the form does not ask for one, because answering a ' +
      'business enquiry is a pre-contractual step rather than something consent ' +
      'is the right basis for. The stored row records LEGITIMATE_INTEREST and ' +
      'leaves consentAt null.\n\nRate limited to 5 per hour per IP.',
    {
      tests: [
        'const d = pm.response.json().data;',
        "pm.test('201 created', () => pm.response.to.have.status(201));",
        "pm.test('reference is a VDP-ENQ number', () =>",
        '  pm.expect(d.referenceNo).to.match(/^VDP-ENQ-/));',
        "pm.collectionVariables.set('privacyReference', d.referenceNo);",
      ],
    },
  ),
  request(
    'Brief with an unknown jurisdiction (expect 404)',
    'POST',
    'privacy/enquiries',
    {
      fullName: 'Aisha Rahman',
      organisation: 'Gulf Retail Group',
      workEmail: 'aisha.rahman@example.com',
      jurisdictionCode: 999,
      serviceCode: 303,
      brief: 'Testing the master lookup.',
    },
    'Jurisdictions and services are validated against the privacy masters, so ' +
      'an invented code is a 404 rather than something that lands in the table.',
    {
      tests: [
        "pm.test('404 not found', () => pm.response.to.have.status(404));",
      ],
    },
  ),
];

const adminItems = [
  request(
    'List enquiries',
    'GET',
    'admin/privacy-enquiries',
    null,
    SIGN_IN_FIRST +
      'Newest first. The list withholds the brief and phone — a privacy brief ' +
      'routinely names data subjects, systems and incidents, so it is fetched ' +
      'only when a practitioner opens the record.',
    {
      admin: true,
      tests: [
        'const body = pm.response.json();',
        "pm.test('200 OK', () => pm.response.to.have.status(200));",
        "pm.test('the brief is withheld from the list', () =>",
        '  body.data.items.forEach((e) => pm.expect(e.brief).to.eql(undefined)));',
        'if (body.data.items.length) {',
        "  pm.collectionVariables.set('privacyEnquiryId', body.data.items[0].id);",
        '}',
      ],
    },
  ),
  request(
    'Get one enquiry — check consent and jurisdiction',
    'GET',
    'admin/privacy-enquiries/{{privacyEnquiryId}}',
    null,
    SIGN_IN_FIRST +
      'The full record: the brief and phone are returned here and nowhere else. ' +
      'lawfulBasis is LEGITIMATE_INTEREST, consentAt is null because no tick was ' +
      'ever shown, and jurisdictionCode names the regime that routed it.',
    {
      admin: true,
      tests: [
        'const e = pm.response.json().data;',
        "pm.test('200 OK', () => pm.response.to.have.status(200));",
        "pm.test('the brief is present on the detail record', () =>",
        "  pm.expect(e.brief).to.be.a('string'));",
        "pm.test('lawful basis is legitimate interest', () =>",
        "  pm.expect(e.lawfulBasis).to.eql('LEGITIMATE_INTEREST'));",
        "pm.test('no consent record, because no tick was shown', () =>",
        '  pm.expect(e.consentAt).to.eql(null));',
        "pm.test('jurisdiction is set', () =>",
        "  pm.expect(e.jurisdictionCode).to.be.a('number'));",
      ],
    },
  ),
  request(
    'Enquiry timeline',
    'GET',
    'admin/privacy-enquiries/{{privacyEnquiryId}}/events',
    null,
    SIGN_IN_FIRST +
      'Every state change, with the jurisdiction, service and office the ' +
      'submission resolved to recorded on the CREATED event.',
    { admin: true },
  ),
  request(
    'Update status',
    'PATCH',
    'admin/privacy-enquiries/{{privacyEnquiryId}}/status',
    { status: 'IN_PROGRESS', note: 'Scoping call booked with the practice.' },
    SIGN_IN_FIRST +
      'NEW, IN_PROGRESS, RESOLVED, CLOSED or SPAM. The first move off NEW is the ' +
      'acknowledgement the page promises, so it stops the SLA clock.',
    {
      admin: true,
      tests: [
        'const e = pm.response.json().data;',
        "pm.test('200 OK', () => pm.response.to.have.status(200));",
        "pm.test('the first move stops the clock', () =>",
        '  pm.expect(e.firstRespondedAt).to.not.eql(null));',
      ],
    },
  ),
  request(
    'Assign to a practitioner',
    'PATCH',
    'admin/privacy-enquiries/{{privacyEnquiryId}}/assign',
    { assignedTo: 'privacy.lead@veltrixair.com' },
    SIGN_IN_FIRST +
      'Sets assignedAt alongside assignedTo. The two move together, which a ' +
      'CHECK constraint enforces, so "how long has this sat with them" can never ' +
      'read as null on an assigned record.',
    {
      admin: true,
      tests: [
        'const e = pm.response.json().data;',
        "pm.test('assignedAt is set with assignedTo', () =>",
        '  pm.expect(e.assignedAt).to.not.eql(null));',
      ],
    },
  ),
  request(
    'Hand it back (unassign)',
    'PATCH',
    'admin/privacy-enquiries/{{privacyEnquiryId}}/assign',
    { assignedTo: null },
    SIGN_IN_FIRST +
      'Passing null returns it to the unassigned queue and clears assignedAt in ' +
      'the same move.',
    {
      admin: true,
      tests: [
        'const e = pm.response.json().data;',
        "pm.test('both cleared together', () =>",
        "  pm.expect(e.assignedTo).to.eql(null) && pm.expect(e.assignedAt).to.eql(null));",
      ],
    },
  ),
  request(
    'Add an internal note',
    'POST',
    'admin/privacy-enquiries/{{privacyEnquiryId}}/notes',
    { note: 'Client has an existing RoPA; ask for it before the DPIA scoping.' },
    SIGN_IN_FIRST + 'Appends to the timeline. Never shown to the enquirer.',
    { admin: true },
  ),
  request(
    'From another dashboard (expect 403)',
    'GET',
    'admin/privacy-enquiries',
    null,
    'Set {{siteCode}} back to 101, run Auth / Login, then send this.\n\n' +
      'A 403, and worth understanding why it is not automatic: role_permissions ' +
      'is (role, feature) with no site column, so SUPER_ADMIN holds feature 110 ' +
      'on every dashboard it can sign in to. A @SiteScope guard on the ' +
      'controller compares the badge’s site against the one the feature ' +
      'belongs to. The same guard covers both crane modules.',
    {
      admin: true,
      tests: [
        "pm.test('403 wrong dashboard', () => pm.response.to.have.status(403));",
      ],
    },
  ),
];

// Remove the nested folder the previous version created under Contact.
const contact = collection.item.find((f) => f.name === 'Contact');
if (contact) {
  contact.item = contact.item.filter(
    (i) => i.name !== 'Privacy brand (site 103)',
  );
}

collection.item = collection.item.filter((f) => f.name !== FOLDER);

// Beside the other brand-specific folders rather than at the end.
const folder = {
  name: FOLDER,
  item: [
    { name: 'Public', item: publicItems },
    { name: 'Admin', item: adminItems },
  ],
};
const anchor = collection.item.findIndex((f) => f.name === 'Crane Site Visits');
if (anchor === -1) collection.item.push(folder);
else collection.item.splice(anchor + 1, 0, folder);

fs.writeFileSync(FILE, `${JSON.stringify(collection, null, 2)}\n`);

const count = (nodes) =>
  nodes.reduce((n, x) => n + (x.item ? count(x.item) : 1), 0);
console.log(
  `${FOLDER}: ${publicItems.length} public + ${adminItems.length} admin; ` +
    `${count(collection.item)} requests in the collection.`,
);
