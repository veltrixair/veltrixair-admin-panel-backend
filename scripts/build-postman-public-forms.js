/**
 * Builds a standalone Postman collection for every public form.
 *
 *   node scripts/build-postman-public-forms.js
 *
 * Writes docs/veltrixair-public-forms.postman_collection.json, plus a small
 * sample CV the two application requests upload. `docs/` is gitignored, so the
 * generator is the versioned artefact and the collection is rebuilt rather
 * than committed.
 *
 * WHAT THIS IS FOR
 *
 * Proving a form end to end: the request carries a complete, valid body, the
 * API accepts it, and a row lands in the database. Every folder therefore
 * starts by fetching that form's own option lists and captures the codes from
 * them — nothing here hardcodes a master-data code, because a collection that
 * kept its own copy of a list would drift exactly as the website's dropdowns
 * did.
 *
 * RUN EACH FOLDER IN ORDER. The first request in a folder captures what the
 * rest need.
 *
 * EVERY RUN USES FRESH DATA. Emails carry a per-run id and the booking picks
 * an hour nobody holds, because the API enforces one live application per
 * person per role, one general application per person, and one session per
 * hour. Without that, a second run would collide with the first and look like
 * a broken endpoint rather than a working guard.
 */

const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');
const OUT = path.join(DOCS, 'veltrixair-public-forms.postman_collection.json');
const CV = path.join(DOCS, 'sample-cv.pdf');

/* ----------------------------------------------------------- helpers --- */

const url = (raw) => {
  const [p, q] = raw.replace('{{baseUrl}}/', '').split('?');
  const out = { raw, host: ['{{baseUrl}}'], path: p.split('/').filter(Boolean) };
  if (q) {
    out.query = q.split('&').map((kv) => {
      const [key, value = ''] = kv.split('=');
      return { key, value };
    });
  }
  return out;
};

const script = (listen, exec) => ({
  listen,
  script: { type: 'text/javascript', exec },
});

const events = (before, after) => {
  const event = [];
  if (before) event.push(script('prerequest', before));
  if (after) event.push(script('test', after));
  return event.length ? { event } : {};
};

/** A JSON request. The three public sites all send X-Site-Code. */
const json = ({ name, method = 'GET', path: p, body, description, test, pre }) => ({
  name,
  ...events(pre, test),
  request: {
    auth: { type: 'noauth' },
    method,
    header: [
      { key: 'X-Site-Code', value: '{{siteCode}}' },
      { key: 'Accept', value: 'application/json' },
      ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : []),
    ],
    ...(body
      ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } }
      : {}),
    url: url(`{{baseUrl}}${p}`),
    description,
  },
  response: [],
});

/**
 * A multipart request. Only the two application endpoints need it, and only
 * because a résumé travels with them — every scalar therefore arrives as text
 * and the API coerces it.
 */
const multipart = ({ name, path: p, fields, description, test, pre }) => ({
  name,
  ...events(pre, test),
  request: {
    auth: { type: 'noauth' },
    method: 'POST',
    header: [
      { key: 'X-Site-Code', value: '{{siteCode}}' },
      { key: 'Accept', value: 'application/json' },
    ],
    body: {
      mode: 'formdata',
      formdata: fields.map((f) =>
        f.type === 'file'
          ? { key: f.key, type: 'file', src: f.src, description: f.description }
          : {
              key: f.key,
              value: f.value,
              type: 'text',
              description: f.description,
            },
      ),
    },
    url: url(`{{baseUrl}}${p}`),
    description,
  },
  response: [],
});

/** Shared opening lines for a test script. */
const ok = (code) => [
  `pm.test("${code}", () => pm.response.to.have.status(${code}));`,
  `const body = pm.response.json();`,
];

/* --------------------------------------------------------- 1. contact --- */

const CONTACT_OPTIONS = json({
  name: '1 · Form options',
  path: '/contact/form-options',
  description:
    'Every dropdown on the contact form, from the database.\n\n' +
    'Run this first: the submission below sends the codes captured here. ' +
    'Industries are per-brand — site 101 has nine and the crane brand has ' +
    'fifteen — so a code picked from the wrong list is rejected as unknown.',
  test: [
    ...ok(200),
    `const d = body.data;`,
    ``,
    `pm.test("three lists present", () =>`,
    `  ["countries", "industries", "timelines"]`,
    `    .forEach((k) => pm.expect(d[k], k).to.be.an("array").that.is.not.empty));`,
    ``,
    `pm.collectionVariables.set("countryCode", d.countries[0].code);`,
    `pm.collectionVariables.set("industryCode", d.industries[0].code);`,
    `pm.collectionVariables.set("timelineCode", d.timelines[0].code);`,
    ``,
    `console.log("country  " + d.countries[0].label);`,
    `console.log("industry " + d.industries[0].label);`,
  ],
});

const CONTACT_SUBMIT = json({
  name: '2 · Submit an enquiry',
  method: 'POST',
  path: '/contact/enquiries',
  description:
    'A complete enquiry. Stored in `contact_enquiries`, routed to the office ' +
    'that owns the country, with an SLA due date on that office calendar.\n\n' +
    'JSON, not multipart — this endpoint has no file, so a FormData body ' +
    'would not parse and every field would read as missing.\n\n' +
    '`company` and `message` are optional and `phone` is required, matching ' +
    'the website exactly. Five per hour per IP.',
  body: {
    fullName: 'Asha Menon',
    company: 'Acme Health Systems',
    roleTitle: 'Chief Technology Officer',
    workEmail: 'asha.menon+{{runId}}@acmehealth.in',
    phone: '+91 98765 43210',
    countryCode: '{{countryCode}}',
    industryCode: '{{industryCode}}',
    timelineCode: '{{timelineCode}}',
    message:
      'We run three hospitals in Bihar on four disconnected systems — ' +
      'registration, billing, pharmacy and lab all keep their own records. ' +
      'We are looking for one platform, with ABDM compliance in scope, and ' +
      'would like to understand migration effort and timeline.',
    requiresNda: false,
    consentGiven: true,
  },
  pre: [
    `// Codes arrive as strings in the raw body; the API wants numbers.`,
    `const raw = pm.request.body.raw`,
    `  .replace(/"countryCode": *"(\\d+)"/, '"countryCode": $1')`,
    `  .replace(/"industryCode": *"(\\d+)"/, '"industryCode": $1')`,
    `  .replace(/"timelineCode": *"(\\d+)"/, '"timelineCode": $1');`,
    `pm.request.body.raw = raw;`,
  ],
  test: [
    ...ok(201),
    `pm.test("a reference was issued", () =>`,
    `  pm.expect(body.data.referenceNo).to.match(/^VLX-\\d{4}-\\d{6}$/));`,
    `pm.test("routed to an office inbox", () =>`,
    `  pm.expect(body.data.routedTo ?? body.data.office ?? "").to.be.a("string"));`,
    `pm.collectionVariables.set("enquiryRef", body.data.referenceNo);`,
    `console.log("stored as " + body.data.referenceNo);`,
  ],
});

/* --------------------------------------------------------- 2. careers --- */

const APPLY_OPTIONS = json({
  name: '1 · Apply options',
  path: '/careers/apply-options',
  description:
    'Seven lists for the application form.\n\n' +
    '`relevantExperienceBands` is the same list as `experienceBands` without ' +
    'Fresher: no experience at all and none of it in this discipline are ' +
    'different answers, and the API refuses Fresher on the relevant question.',
  test: [
    ...ok(200),
    `const d = body.data;`,
    ``,
    `pm.test("seven lists present", () =>`,
    `  ["qualifications","noticePeriods","workAuthorisations","sources",`,
    `   "countries","experienceBands","relevantExperienceBands"]`,
    `    .forEach((k) => pm.expect(d[k], k).to.be.an("array")));`,
    ``,
    `pm.test("Fresher is not offered for relevant experience", () =>`,
    `  pm.expect(d.relevantExperienceBands.map((b) => b.label)).to.not.include("Fresher"));`,
    ``,
    `pm.collectionVariables.set("qualificationCode", d.qualifications[2].code);`,
    `pm.collectionVariables.set("experienceBandCode", d.experienceBands[4].code);`,
    `pm.collectionVariables.set("relevantBandCode", d.relevantExperienceBands[2].code);`,
    `pm.collectionVariables.set("noticePeriodCode", d.noticePeriods[2].code);`,
  ],
});

const APPLICANT_FIELDS = (emailTag) => [
  { key: 'fullName', value: 'Syed Adil Bakshi', description: 'One field, not first/last — the form asks one question.' },
  { key: 'email', value: `adil.bakshi+${emailTag}@example.in` },
  { key: 'phone', value: '9876543210' },
  { key: 'phoneCode', value: '+91 IN', description: 'The picker sends dial + ISO; the API keeps the dial half.' },
  { key: 'currentCountry', value: 'India', description: 'Free text — not a code. This one never routes anything.' },
  { key: 'city', value: 'Bengaluru' },
  { key: 'linkedinUrl', value: 'https://www.linkedin.com/in/example-candidate' },
  { key: 'portfolioUrl', value: 'https://github.com/example-candidate' },
  { key: 'qualificationCode', value: '{{qualificationCode}}' },
  { key: 'currentCompany', value: 'Zenith Software Labs' },
  { key: 'currentTitle', value: 'Senior Backend Engineer' },
  { key: 'experienceBandCode', value: '{{experienceBandCode}}' },
  { key: 'relevantExperienceBandCode', value: '{{relevantBandCode}}' },
  { key: 'noticePeriodCode', value: '{{noticePeriodCode}}' },
  { key: 'keySkills', value: 'Node.js, PostgreSQL, NestJS, AWS', description: 'Comma-separated or repeated parts — both are accepted.' },
  { key: 'currentCtc', value: '18 LPA', description: 'Free text: "negotiable" is a real answer.' },
  { key: 'currentCtcCurrency', value: 'INR' },
  { key: 'expectedSalary', value: '2400000', description: 'Numeric. Separators are stripped, so "24,00,000" also works.' },
  { key: 'salaryCurrency', value: 'INR' },
  { key: 'willingToRelocate', value: 'true' },
  { key: 'coverNote', value: 'I have spent six years on hospital and claims systems in India and would like to work on kNODE.' },
  { key: 'consentGiven', value: 'true', description: 'Required. The lawful basis for keeping a CV twelve months.' },
  { key: 'sourcePage', value: '/careers/joinVeltrixair' },
  {
    key: 'resume',
    type: 'file',
    src: CV.replace(/\\/g, '/'),
    description:
      'PDF / DOC / DOCX, 5 MB, checked by magic bytes rather than extension. ' +
      'Postman may ask you to re-select this file the first time.',
  },
];

const GENERAL_APPLY = multipart({
  name: '2 · General application (talent pool)',
  path: '/careers/apply',
  description:
    'Somebody answering "Be A Part Of Our Journey" rather than a vacancy. ' +
    'Stored with `job_id` null, which is what makes the talent-pool view.\n\n' +
    'One live general application per person per site: running this twice ' +
    'with the same email returns 409, which is the guard working.',
  fields: APPLICANT_FIELDS('{{runId}}'),
  test: [
    ...ok(201),
    `pm.test("reference issued", () =>`,
    `  pm.expect(body.data.referenceNo).to.match(/^VLX-APP-\\d{4}-\\d{6}$/));`,
    `pm.test("no role attached", () =>`,
    `  pm.expect(body.data.jobTitle).to.equal(null));`,
    `pm.collectionVariables.set("generalAppToken", body.data.manageToken);`,
    `console.log("stored as " + body.data.referenceNo);`,
  ],
});

const JOBS_LIST = json({
  name: '3 · Open roles (captures a slug)',
  path: '/careers/jobs?category=experienced&limit=5',
  description:
    'The careers pages ask per category — internship, coach, experienced — ' +
    'and each shows only its own roles. The slug captured here is what the ' +
    'Apply button posts to.',
  test: [
    ...ok(200),
    `const items = body.data.items;`,
    `pm.test("at least one open role", () => pm.expect(items).to.not.be.empty);`,
    `pm.test("every role carries its category", () =>`,
    `  items.forEach((j) => pm.expect(j.category, j.title).to.not.be.null));`,
    `pm.collectionVariables.set("jobSlug", items[0].slug);`,
    `console.log("applying to: " + items[0].title);`,
  ],
});

const ROLE_APPLY = multipart({
  name: '4 · Apply for that role',
  path: '/careers/jobs/{{jobSlug}}/apply',
  description:
    'The same body, filed against a vacancy instead of the talent pool.\n\n' +
    'Which questions a posting asks, and which it requires, is a property of ' +
    'the posting — so a role may refuse this with "X is required for this ' +
    'role" even though the body is complete. That is the field config ' +
    'working, not a malformed request.',
  fields: APPLICANT_FIELDS('role{{runId}}'),
  test: [
    ...ok(201),
    `pm.test("filed against the role", () =>`,
    `  pm.expect(body.data.jobTitle).to.be.a("string").and.not.empty);`,
    `pm.collectionVariables.set("roleAppToken", body.data.manageToken);`,
    `console.log("stored as " + body.data.referenceNo + " for " + body.data.jobTitle);`,
  ],
});

const APP_STATUS = json({
  name: '5 · Check the application (no account)',
  path: '/careers/applications/{{generalAppToken}}',
  description:
    'The link in the confirmation email. Shows status and whether it can ' +
    'still be withdrawn — withdrawing deletes the résumé immediately, ' +
    'because a withdrawal is a revocation of consent.',
  test: [
    ...ok(200),
    `pm.test("shows its reference and status", () => {`,
    `  pm.expect(body.data.referenceNo).to.be.a("string");`,
    `  pm.expect(body.data.status).to.be.a("string");`,
    `});`,
  ],
});

/* ------------------------------------------------------- 3. architect --- */

const TAKEN_HOURS = json({
  name: '1 · Hours already taken (picks a free one)',
  path: '/discovery/taken-hours?date={{bookingDate}}',
  description:
    'What the calendar greys out. Sessions run every calendar day, on the ' +
    'hour, 09:00–23:00 India time, one booking per hour.\n\n' +
    'No practice and no architect: the website asks for a time, and the desk ' +
    'assigns who takes it afterwards.',
  pre: [
    `// A date far enough out that the hour is still free on a repeat run.`,
    `const d = new Date();`,
    `d.setDate(d.getDate() + 45);`,
    `const iso = d.getFullYear() + "-" +`,
    `  String(d.getMonth() + 1).padStart(2, "0") + "-" +`,
    `  String(d.getDate()).padStart(2, "0");`,
    `pm.collectionVariables.set("bookingDate", iso);`,
  ],
  test: [
    ...ok(200),
    `const taken = body.data.taken;`,
    `pm.test("returns the day it was asked about", () =>`,
    `  pm.expect(body.data.date).to.equal(pm.collectionVariables.get("bookingDate")));`,
    ``,
    `// First hour nobody holds. All 15 taken would mean a genuinely full day.`,
    `const hours = Array.from({ length: 15 }, (_, i) =>`,
    `  String(9 + i).padStart(2, "0") + ":00");`,
    `const free = hours.find((h) => !taken.includes(h));`,
    `pm.test("a free hour exists", () => pm.expect(free, "day is full").to.be.ok);`,
    ``,
    `pm.collectionVariables.set("bookingHour", free);`,
    `pm.collectionVariables.set("requestedStartAt",`,
    `  pm.collectionVariables.get("bookingDate") + "T" + free + ":00+05:30");`,
    `console.log("booking " + pm.collectionVariables.get("requestedStartAt"));`,
  ],
});

const BOOK_SESSION = json({
  name: '2 · Request a session',
  method: 'POST',
  path: '/discovery/bookings',
  description:
    'A request for an hour, not a confirmed session: no architect is chosen ' +
    'here, so the row lands as REQUESTED with a null architect and the desk ' +
    'assigns one from the panel.\n\n' +
    '`requestedStartAt` carries its offset so nothing has to guess which zone ' +
    '"09:00" meant. Re-posting the same instant returns 409 — one booking per ' +
    'hour, enforced by a unique index rather than a check that could race.',
  body: {
    requestedStartAt: '{{requestedStartAt}}',
    fullName: 'Asha Menon',
    company: 'Acme Health Systems',
    roleTitle: 'Chief Technology Officer',
    workEmail: 'asha.architect+{{runId}}@acmehealth.in',
    phone: '9876543210',
    phoneCode: '+91 IN',
    programme:
      'Three hospitals on one records platform, ABDM in scope. We want to ' +
      'understand the migration path from four existing systems, what the ' +
      'integration surface looks like, and a realistic phasing over two years.',
    requiresNda: false,
    consentGiven: true,
  },
  test: [
    ...ok(201),
    `pm.test("reference issued", () =>`,
    `  pm.expect(body.data.referenceNo).to.match(/^DC-\\d{4}-\\d{6}$/));`,
    `pm.test("no architect yet — the desk assigns one", () =>`,
    `  pm.expect(body.data.architect).to.equal(null));`,
    `pm.test("told it is a request, not a confirmation", () =>`,
    `  pm.expect(body.data.message).to.contain("confirm"));`,
    `pm.collectionVariables.set("bookingToken", body.data.manageToken);`,
    `console.log("stored as " + body.data.referenceNo + " at " + body.data.localTime);`,
  ],
});

const BOOK_AGAIN = json({
  name: '3 · The same hour again (expect 409)',
  method: 'POST',
  path: '/discovery/bookings',
  description:
    'One booking per hour. Two people confirming at the same moment both ' +
    'pass any read-then-write check, so this is settled by a partial unique ' +
    'index — cancelled bookings are excluded, which is how an hour frees up.',
  body: {
    requestedStartAt: '{{requestedStartAt}}',
    fullName: 'Someone Else',
    company: 'Other Company',
    roleTitle: 'CEO',
    workEmail: 'other.person+{{runId}}@example.in',
    phone: '9876543211',
    phoneCode: '+91 IN',
    programme: 'A different enquiry that wants the same hour.',
    consentGiven: true,
  },
  test: [
    `pm.test("409", () => pm.response.to.have.status(409));`,
    `const body = pm.response.json();`,
    `pm.test("says the time has gone", () =>`,
    `  pm.expect(body.message).to.contain("taken"));`,
  ],
});

const BOOKING_STATUS = json({
  name: '4 · Check the booking (no account)',
  path: '/discovery/bookings/{{bookingToken}}',
  description: 'The link in the request email, for checking or cancelling.',
  test: [
    ...ok(200),
    `pm.test("still a request until the desk assigns", () =>`,
    `  pm.expect(["REQUESTED", "BOOKED"]).to.include(body.data.status));`,
  ],
});

/* -------------------------------------------------------- assembly ----- */

const collection = {
  info: {
    _postman_id: '9f2c7a10-5f6e-4c3a-9c21-8f7b6d4e1a20',
    name: 'Veltrixair · Public forms',
    description:
      'Every form on the public sites, end to end: a complete body goes in, ' +
      'a row lands in the database.\n\n' +
      'RUN EACH FOLDER IN ORDER — the first request captures the codes the ' +
      'rest use. Nothing here hardcodes a master-data code: the lists come ' +
      'from the API, because a collection keeping its own copy would drift ' +
      'exactly as the website\'s dropdowns did.\n\n' +
      'EVERY RUN USES FRESH DATA. A per-run id goes into the emails and the ' +
      'booking picks an hour nobody holds, because the API enforces one live ' +
      'application per person per role, one general application per person, ' +
      'and one session per hour. Re-running would otherwise collide with the ' +
      'previous run and look like a broken endpoint.\n\n' +
      'THROTTLES, so a full run twice in an hour will start returning 429:\n' +
      '  contact enquiries    5 / hour / IP\n' +
      '  applications        10 / hour / IP\n' +
      '  bookings             5 / hour / IP\n\n' +
      'THE CV UPLOAD: the two application requests send docs/sample-cv.pdf, ' +
      'generated beside this file. Postman may ask you to re-select it the ' +
      'first time — it will not send a file path it has not been shown.',
    schema:
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [
    script('prerequest', [
      '// One id per run, so emails are unique and the duplicate guards do not',
      '// fire against the previous run.',
      "if (!pm.collectionVariables.get('runId')) {",
      "  pm.collectionVariables.set('runId', String(Date.now()).slice(-6));",
      '}',
    ]),
  ],
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000' },
    { key: 'siteCode', value: '101' },
    { key: 'runId', value: '' },
    { key: 'countryCode', value: '' },
    { key: 'industryCode', value: '' },
    { key: 'timelineCode', value: '' },
    { key: 'enquiryRef', value: '' },
    { key: 'qualificationCode', value: '' },
    { key: 'experienceBandCode', value: '' },
    { key: 'relevantBandCode', value: '' },
    { key: 'noticePeriodCode', value: '' },
    { key: 'jobSlug', value: '' },
    { key: 'generalAppToken', value: '' },
    { key: 'roleAppToken', value: '' },
    { key: 'bookingDate', value: '' },
    { key: 'bookingHour', value: '' },
    { key: 'requestedStartAt', value: '' },
    { key: 'bookingToken', value: '' },
  ],
  item: [
    {
      name: 'Contact · Change Starts With A Conversation',
      description:
        'The enquiry form on the homepage. Country decides which office owns ' +
        'the enquiry and whose working week its SLA runs on, which is why it ' +
        'is a code rather than free text.',
      item: [CONTACT_OPTIONS, CONTACT_SUBMIT],
    },
    {
      name: 'Careers · Applications',
      description:
        'Both shapes. A candidate who opened the form from a role card is ' +
        'applying for that role; one on "Be A Part Of Our Journey" is not ' +
        'applying for anything in particular, and that is a talent-pool ' +
        'application rather than a degraded version of the first.',
      item: [APPLY_OPTIONS, GENERAL_APPLY, JOBS_LIST, ROLE_APPLY, APP_STATUS],
    },
    {
      name: 'Architect · Talk to an Architect',
      description:
        'The header button\'s booking pop-up. A booking is a request for an ' +
        'hour: the architect is assigned afterwards from the admin panel, ' +
        'along with the practice.',
      item: [TAKEN_HOURS, BOOK_SESSION, BOOK_AGAIN, BOOKING_STATUS],
    },
  ],
};

/* ----------------------------------------------------------- write ----- */

fs.mkdirSync(DOCS, { recursive: true });

// A minimal but genuinely valid PDF — the API checks magic bytes, not the
// extension, so an empty file named .pdf would be refused.
if (!fs.existsSync(CV)) {
  const pdf = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj',
    'trailer<</Root 1 0 R>>',
    '%%EOF',
    '',
  ].join('\n');
  fs.writeFileSync(CV, pdf, 'latin1');
}

fs.writeFileSync(OUT, JSON.stringify(collection, null, 2));

const count = collection.item.reduce((n, f) => n + f.item.length, 0);
console.log(`  wrote ${path.relative(process.cwd(), OUT)}`);
console.log(`  ${collection.item.length} folders, ${count} requests`);
console.log(`  sample CV: ${path.relative(process.cwd(), CV)}`);
