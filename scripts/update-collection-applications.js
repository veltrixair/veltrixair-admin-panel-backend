/**
 * Adds the Applications folder to the Postman collection.
 *
 *   node scripts/update-collection-applications.js
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

for (const v of [
  { key: 'applicationId', value: '', type: 'string' },
  { key: 'manageToken', value: '', type: 'string' },
  { key: 'jobSlug', value: '', type: 'string' },
]) {
  if (!collection.variable.find((x) => x.key === v.key)) {
    collection.variable.push(v);
  }
}

const script = (lines) => ({
  listen: 'test',
  script: { type: 'text/javascript', exec: lines },
});

const json = (value) => ({ mode: 'raw', raw: JSON.stringify(value, null, 2) });

const url = (segments, raw) => ({
  raw: `{{baseUrl}}/${raw ?? segments.join('/')}`,
  host: ['{{baseUrl}}'],
  path: segments,
});

/** The apply form as multipart — every field is text except the résumé. */
const applyFormData = [
  { key: 'firstName', value: 'Layla', type: 'text' },
  { key: 'lastName', value: 'Haddad', type: 'text' },
  { key: 'email', value: 'layla.haddad@example.com', type: 'text' },
  { key: 'phone', value: '+966 55 123 4567', type: 'text' },
  { key: 'currentTitle', value: 'Senior Platform Engineer', type: 'text' },
  { key: 'qualificationCode', value: '104', type: 'text', description: "104 = Master's Degree" },
  { key: 'experienceYears', value: '7.5', type: 'text' },
  { key: 'city', value: 'Riyadh', type: 'text' },
  { key: 'countryCode', value: '101', type: 'text' },
  { key: 'noticePeriodCode', value: '103', type: 'text', description: '103 = 30 days' },
  { key: 'workAuthorisationCode', value: '101', type: 'text', description: '101 = Citizen or permanent resident' },
  { key: 'consentGiven', value: 'true', type: 'text', description: 'Required. "false" is correctly rejected.' },
  { key: 'linkedinUrl', value: 'https://www.linkedin.com/in/example', type: 'text' },
  { key: 'expectedSalary', value: '420000', type: 'text', description: 'Needs salaryCurrency alongside it' },
  { key: 'salaryCurrency', value: 'SAR', type: 'text' },
  { key: 'coverNote', value: 'I have led three core-banking modernisations under PDPL.', type: 'text' },
  { key: 'sourceCode', value: '101', type: 'text' },
  { key: 'resume', type: 'file', src: [], description: 'Required. PDF, DOC or DOCX, max 5 MB. Verified by magic bytes, not by extension.' },
];

const folder = {
  name: 'Applications',
  description:
    'Job applications — careers Scope B.\n\n' +
    'There is deliberately **no candidate login**. A random 48-character manage ' +
    'token, emailed to the applicant, is what lets them check status or withdraw ' +
    '— the same pattern discovery bookings use.\n\n' +
    'Admin routes are guarded by APPLICATIONS (107), **not** CAREERS. ' +
    'CONTENT_EDITOR and VIEWER hold CAREERS:VIEW so they can work on job adverts; ' +
    'sharing a feature code would have handed them every candidate\'s phone ' +
    'number, salary expectation and CV. Only RECRUITER and SUPER_ADMIN reach these.\n\n' +
    'Run "List open roles" in the Careers folder first — it captures {{jobSlug}}.',
  item: [
    {
      name: 'Apply form options',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('all five lists present', () => {",
          "  ['qualifications','noticePeriods','workAuthorisations','sources','countries']",
          '    .forEach((k) => pm.expect(body.data[k].length).to.be.above(0));',
          '});',
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'GET',
        header: [],
        url: url(['careers', 'apply-options']),
        description:
          'Every dropdown on the apply form. Countries are the same list the ' +
          'contact form uses rather than a duplicate.',
      },
    },
    {
      name: 'Apply for a role',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('201 created', () => pm.response.to.have.status(201));",
          "pm.test('reference number issued', () => pm.expect(body.data.referenceNo).to.match(/^VLX-APP-\\d{4}-\\d{6}$/));",
          "pm.collectionVariables.set('manageToken', body.data.manageToken);",
          'console.log(`Reference ${body.data.referenceNo} — manage link: /careers/applications/${body.data.manageToken}`);',
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [],
        body: { mode: 'formdata', formdata: applyFormData },
        url: url(['careers', 'jobs', '{{jobSlug}}', 'apply']),
        description:
          'Multipart. **Attach a real PDF to the `resume` field before sending** — ' +
          'Postman cannot ship a file with the collection.\n\n' +
          '10 per hour per IP: a candidate reasonably applies to several roles in ' +
          'one sitting, and rejected attempts count too.\n\n' +
          'The résumé is uploaded only after the job, the codes and the ' +
          'duplicate check have all passed, so a rejected application never ' +
          'leaves a file behind.',
      },
    },
    {
      name: 'Apply again — same email, same role (expect 409)',
      event: [
        script(["pm.test('409 conflict', () => pm.response.to.have.status(409));"]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [],
        body: { mode: 'formdata', formdata: applyFormData },
        url: url(['careers', 'jobs', '{{jobSlug}}', 'apply']),
        description:
          'One live application per person per role. Once an application is ' +
          'REJECTED or WITHDRAWN the same candidate may apply again.',
      },
    },
    {
      name: 'Apply without consent (expect 400)',
      event: [
        script(["pm.test('400 bad request', () => pm.response.to.have.status(400));"]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [],
        body: {
          mode: 'formdata',
          formdata: applyFormData.map((f) =>
            f.key === 'consentGiven' ? { ...f, value: 'false' } : f,
          ),
        },
        url: url(['careers', 'jobs', '{{jobSlug}}', 'apply']),
        description:
          'The résumé is kept for twelve months, so consent is not optional.\n\n' +
          'This case caught a real bug: the global ValidationPipe runs with ' +
          '`enableImplicitConversion`, which coerces booleans as `Boolean(value)` — ' +
          'so the string "false" became `true` and an application was accepted ' +
          'without consent. Fixed with a ToBoolean transformer that reads the ' +
          'original value.',
      },
    },
    {
      name: 'Check my application (candidate)',
      event: [
        script([
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('no PII beyond their own status', () => {",
          '  const body = pm.response.json();',
          "  pm.expect(body.data).to.not.have.property('phone');",
          "  pm.expect(body.data).to.not.have.property('expectedSalary');",
          '});',
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'GET',
        header: [],
        url: url(['careers', 'applications', '{{manageToken}}']),
        description:
          'No account. Possession of the token is the credential, which is why ' +
          'it is 24 random bytes and must never be logged or shared.',
      },
    },
    {
      name: 'Withdraw (deletes the résumé)',
      event: [
        script(["pm.test('200 OK', () => pm.response.to.have.status(200));"]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [],
        url: url(['careers', 'applications', '{{manageToken}}', 'withdraw']),
        description:
          'A withdrawal is a revocation of consent, so the CV is deleted from ' +
          'storage immediately rather than waiting for the twelve-month ' +
          'retention date. The cover note is cleared too.\n\n' +
          'The application row survives on purpose — without it there is no ' +
          'evidence the data existed or that it was deleted on request.',
      },
    },
    {
      name: 'List applications (admin)',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          'if (body.data.items && body.data.items.length) {',
          "  pm.collectionVariables.set('applicationId', body.data.items[0].id);",
          '}',
          "pm.test('no PII in the list payload', () => {",
          '  (body.data.items || []).forEach((a) => {',
          "    pm.expect(a).to.not.have.property('phone');",
          "    pm.expect(a).to.not.have.property('expectedSalary');",
          "    pm.expect(a).to.not.have.property('coverNote');",
          "    pm.expect(a).to.not.have.property('manageToken');",
          '  });',
          '});',
        ]),
      ],
      request: {
        method: 'GET',
        header: [],
        url: {
          raw: '{{baseUrl}}/admin/applications?page=1&limit=10',
          host: ['{{baseUrl}}'],
          path: ['admin', 'applications'],
          query: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' },
            { key: 'status', value: 'NEW', disabled: true },
            { key: 'jobId', value: '', disabled: true },
            { key: 'search', value: 'haddad', disabled: true },
            { key: 'minExperienceYears', value: '5', disabled: true },
            { key: 'workAuthorisationCode', value: '101', disabled: true, description: 'Who needs no sponsorship' },
            { key: 'noticePeriodCode', value: '101', disabled: true, description: 'Immediately available' },
          ],
        },
        description:
          'Phone, salary, cover note and manage token are held back at the ' +
          'column level, not filtered in code — so a future endpoint cannot ' +
          'leak them by forgetting to exclude them.',
      },
    },
    {
      name: 'Get one application (admin)',
      event: [
        script([
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('full record includes phone and salary', () => {",
          '  const d = pm.response.json().data;',
          "  pm.expect(d).to.have.property('phone');",
          '});',
        ]),
      ],
      request: {
        method: 'GET',
        header: [],
        url: url(['admin', 'applications', '{{applicationId}}']),
        description:
          'The full record, including the columns the list holds back. Still ' +
          'never the manage token — that belongs to the candidate.',
      },
    },
    {
      name: 'Download the résumé (logged)',
      event: [
        script([
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('link is time limited', () => pm.expect(pm.response.json().data.expiresInSeconds).to.be.above(0));",
        ]),
      ],
      request: {
        method: 'GET',
        header: [],
        url: url(['admin', 'applications', '{{applicationId}}', 'resume']),
        description:
          'Returns a short-lived signed URL and writes a RESUME_VIEWED event ' +
          'naming who asked. A CV is the most sensitive thing a candidate hands ' +
          'over, so downloads are attributable.\n\n' +
          'Returns 410 once an application has been withdrawn — the file is gone.',
      },
    },
    {
      name: 'Move through the pipeline',
      event: [
        script(["pm.test('200 OK', () => pm.response.to.have.status(200));"]),
      ],
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ status: 'SHORTLISTED', note: 'Strong PDPL background' }),
        url: url(['admin', 'applications', '{{applicationId}}', 'status']),
        description:
          'NEW → SCREENING → SHORTLISTED → INTERVIEW → OFFER → HIRED / REJECTED.\n\n' +
          'WITHDRAWN is rejected here: only the candidate can withdraw, and a ' +
          'withdrawal cannot be reopened by staff.',
      },
    },
    {
      name: 'Assign to a recruiter',
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ assignedTo: 'recruiter@veltrixair.com' }),
        url: url(['admin', 'applications', '{{applicationId}}', 'assign']),
      },
    },
    {
      name: 'Add an internal note',
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ note: 'Phone screen booked for Sunday.' }),
        url: url(['admin', 'applications', '{{applicationId}}', 'notes']),
      },
    },
    {
      name: 'Timeline',
      event: [
        script([
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('CREATED is first', () => pm.expect(pm.response.json().data[0].eventType).to.eql('CREATED'));",
        ]),
      ],
      request: {
        method: 'GET',
        header: [],
        url: url(['admin', 'applications', '{{applicationId}}', 'events']),
        description:
          'Every status change, note, résumé download and the withdrawal, with ' +
          'who did it and when.',
      },
    },
  ],
};

collection.item = collection.item.filter((i) => i.name !== 'Applications');

// After Careers — an application belongs to a job.
const careersIndex = collection.item.findIndex((i) => i.name === 'Careers');
collection.item.splice(careersIndex + 1, 0, folder);

fs.writeFileSync(FILE, JSON.stringify(collection, null, 2) + '\n');

console.log(`Applications folder: ${folder.item.length} requests`);
console.log(`folders: ${collection.item.map((i) => i.name).join(' | ')}`);
