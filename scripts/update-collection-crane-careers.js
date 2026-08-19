/**
 * Adds the Crane Careers folder to the Postman collection.
 *
 *   node scripts/update-collection-crane-careers.js
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

const FOLDER = 'Crane Careers';
const SITE_HEADER = { key: 'X-Site-Code', value: '102' };

for (const v of [
  { key: 'craneJobId', value: '', type: 'string' },
  { key: 'craneJobSlug', value: '', type: 'string' },
  { key: 'craneApplicationId', value: '', type: 'string' },
]) {
  if (!collection.variable.find((x) => x.key === v.key)) {
    collection.variable.push(v);
  }
}

const script = (lines) => ({
  listen: 'test',
  script: { type: 'text/javascript', exec: lines },
});

const request = (name, method, urlPath, body, description, opts = {}) => ({
  name,
  ...(opts.tests ? { event: [script(opts.tests)] } : {}),
  request: {
    method,
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

const SIGN_IN =
  'Sign in first: set {{siteCode}} to 102, then run Auth / Login. The crane ' +
  'board is @SiteScope(INDUSTRIES), so a token for another dashboard is a 403 ' +
  'rather than an empty list.\n\n';

const publicItems = [
  request(
    'Careers options',
    'GET',
    'crane/careers/options',
    null,
    'Every dropdown on the careers page and its three-section form — tracks, ' +
      'experience BANDS (not years), KSA residency statuses, availability, ' +
      'qualifications including the trades, locations and employment types.',
    {
      tests: [
        'const d = pm.response.json().data;',
        "pm.test('200 OK', () => pm.response.to.have.status(200));",
        "pm.test('six career tracks', () => pm.expect(d.tracks).to.have.lengthOf(6));",
        "pm.test('experience is banded', () =>",
        "  pm.expect(d.experienceBands.map((b) => b.label)).to.include('15+ years'));",
      ],
    },
  ),
  request(
    'List open roles',
    'GET',
    'crane/careers/jobs',
    null,
    'Filter with ?trackCode= and ?locationCode=. Closed roles and roles past ' +
      'their closing date never appear.',
    {
      tests: [
        'const d = pm.response.json().data;',
        "pm.test('200 OK', () => pm.response.to.have.status(200));",
        'if (d.items.length) {',
        "  pm.collectionVariables.set('craneJobSlug', d.items[0].slug);",
        "  pm.collectionVariables.set('craneJobId', d.items[0].id);",
        '}',
      ],
    },
  ),
  request(
    'One role',
    'GET',
    'crane/careers/jobs/{{craneJobSlug}}',
    null,
    'Carries the VTX-CRN discipline code, the certifications the role needs, ' +
      'and the saudiNationalsOnly flag — which is displayed, never enforced.',
  ),
  request(
    'Apply',
    'POST',
    'crane/careers/apply',
    {
      trackCode: 201,
      jobId: '{{craneJobId}}',
      experienceBandCode: 203,
      availabilityCode: 202,
      fullName: 'Aamir Khan',
      nationality: 'Indian',
      email: 'aamir.khan@example.com',
      mobile: '+966 55 000 0000',
      currentLocation: 'Riyadh',
      residencyCode: 203,
      qualificationCode: 201,
      workingLanguages: ['EN', 'HI', 'UR'],
      certifications: 'NDT Level II, Rigging Level 3',
      backgroundSummary:
        'Twelve years on tower and gantry installations across the Eastern Province.',
    },
    'JSON, not multipart — **no CV travels with the form**. The page asks ' +
      'candidates to reply to the acknowledgement with it attached, and an ' +
      'admin then puts it on the record via POST /admin/crane-applications/' +
      ':id/cv. Until that happens the CV lives only in an inbox, outside the ' +
      'twelve-month PDPL retention.\n\n' +
      'Omit jobId for a general application — "keep on file" is one of the six ' +
      'tracks.\n\nRate limited to 5 per hour per IP.',
    {
      tests: [
        'const d = pm.response.json().data;',
        "pm.test('201 created', () => pm.response.to.have.status(201));",
        "pm.test('reference is a VTX-HR number', () =>",
        '  pm.expect(d.referenceNo).to.match(/^VTX-HR-/));',
        "pm.test('the reply asks for the CV by email', () =>",
        "  pm.expect(d.message).to.include('reply to the acknowledgement'));",
      ],
    },
  ),
];

const adminItems = [
  request(
    'List roles',
    'GET',
    'admin/crane-careers/jobs',
    null,
    SIGN_IN + 'Includes drafts and closed roles, which the public board omits.',
    { admin: true },
  ),
  request(
    'Create a role',
    'POST',
    'admin/crane-careers/jobs',
    {
      refCode: 'VTX-CRN-01-SIE',
      slug: 'senior-installation-engineer',
      title: 'Senior Installation Engineer',
      trackCode: 201,
      serviceLineCode: 101,
      locationCode: 201,
      employmentTypeCode: 201,
      experienceBandCode: 203,
      certifications: ['ISO 9927'],
      saudiNationalsOnly: false,
      openings: 2,
      status: 'OPEN',
    },
    SIGN_IN +
      'serviceLineCode links the advert to a crane service line, which is what ' +
      'prints as VTX-CRN-01. Send null for the roles outside the catalogue — ' +
      'sales, HSE, the graduate programme.\n\n' +
      'saudiNationalsOnly is shown on the advert and never enforced at submit: ' +
      'refusing an applicant on nationality is a decision for a person.',
    {
      admin: true,
      tests: [
        "pm.test('201 created', () => pm.response.to.have.status(201));",
        "pm.collectionVariables.set('craneJobId', pm.response.json().data.id);",
      ],
    },
  ),
  request(
    'Update a role',
    'PATCH',
    'admin/crane-careers/jobs/{{craneJobId}}',
    { summary: 'Lead tower and gantry installations across the Central region.' },
    SIGN_IN + 'Send only what changes.',
    { admin: true },
  ),
  request(
    'Publish / close a role',
    'PATCH',
    'admin/crane-careers/jobs/{{craneJobId}}/status',
    { status: 'OPEN' },
    SIGN_IN + 'Publishing for the first time stamps postedAt.',
    { admin: true },
  ),
  request(
    'List candidates',
    'GET',
    'admin/crane-applications',
    null,
    SIGN_IN +
      'Feature 112, separate from the adverts (111), so publishing a vacancy ' +
      'does not come with a list of who applied.\n\n' +
      'The list withholds nationality, mobile, certifications and background — ' +
      'those are the reason the split exists.\n\n' +
      'Try ?awaitingCv=true for the queue that matters day to day: candidates ' +
      'whose CV has not come back by email, and who therefore cannot be ' +
      'screened. ?overdue=true finds those past their published stage deadline.',
    {
      admin: true,
      tests: [
        'const d = pm.response.json().data;',
        "pm.test('200 OK', () => pm.response.to.have.status(200));",
        "pm.test('nationality is withheld from the list', () =>",
        '  d.items.forEach((a) => pm.expect(a.nationality).to.eql(undefined)));',
        'if (d.items.length) {',
        "  pm.collectionVariables.set('craneApplicationId', d.items[0].id);",
        '}',
      ],
    },
  ),
  request(
    'One candidate in full',
    'GET',
    'admin/crane-applications/{{craneApplicationId}}',
    null,
    SIGN_IN +
      'Nationality, mobile, certifications and background summary are returned ' +
      'here and nowhere else.',
    { admin: true },
  ),
  request(
    'Move a stage',
    'PATCH',
    'admin/crane-applications/{{craneApplicationId}}/status',
    { status: 'SCREENING', note: 'CV received by email.' },
    SIGN_IN +
      'SUBMITTED → SCREENING → TECHNICAL_INTERVIEW → FINAL_INTERVIEW → OFFER → ' +
      'HIRED, or REJECTED / WITHDRAWN.\n\n' +
      'Each move resets stageDueAt to the deadline the careers page publishes ' +
      '— 5 working days to screen, 2 weeks to technical, 3 to final, 4 to ' +
      'offer — counted from SUBMISSION on the Riyadh working week, not from ' +
      'the previous stage. A slow screening therefore cannot quietly push the ' +
      'final interview past the date the candidate was given. Terminal stages ' +
      'carry no deadline.',
    {
      admin: true,
      tests: [
        'const a = pm.response.json().data;',
        "pm.test('200 OK', () => pm.response.to.have.status(200));",
        "pm.test('the stage carries a deadline', () =>",
        '  pm.expect(a.stageDueAt).to.not.eql(null));',
      ],
    },
  ),
  request(
    'Attach the CV that arrived by email',
    'POST',
    'admin/crane-applications/{{craneApplicationId}}/cv',
    null,
    SIGN_IN +
      'Multipart, file in the "cv" field (PDF/DOC/DOCX, 5 MB).\n\n' +
      'This is the only route by which a CV ever reaches the record. Until it ' +
      'runs, the file exists only in the careers inbox — unsearchable, and ' +
      'invisible to the twelve-month deletion the page promises. Attaching it ' +
      'is what makes that promise keepable.',
    { admin: true },
  ),
  request(
    'Assign to a recruiter',
    'PATCH',
    'admin/crane-applications/{{craneApplicationId}}/assign',
    { assignedTo: 'crane.recruiter@veltrixair.com' },
    SIGN_IN + 'Send assignedTo: null to return it to the unassigned queue.',
    { admin: true },
  ),
  request(
    'Add an internal note',
    'POST',
    'admin/crane-applications/{{craneApplicationId}}/notes',
    { note: 'Holds a valid ISO 9927 ticket; confirm expiry before the offer.' },
    SIGN_IN + 'Appends to the timeline. Never shown to the candidate.',
    { admin: true },
  ),
  request(
    'Timeline',
    'GET',
    'admin/crane-applications/{{craneApplicationId}}/events',
    null,
    SIGN_IN +
      'Every stage change, the acknowledgement, and the moment the CV was ' +
      'attached.',
    { admin: true },
  ),
];

// The multipart CV upload needs a file field rather than a JSON body.
const cv = adminItems.find((i) => i.name.startsWith('Attach the CV'));
cv.request.body = {
  mode: 'formdata',
  formdata: [
    {
      key: 'cv',
      type: 'file',
      src: [],
      description: 'PDF, DOC or DOCX. Max 5 MB, checked by magic bytes.',
    },
  ],
};

collection.item = collection.item.filter((f) => f.name !== FOLDER);
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
    `${count(collection.item)} in the collection.`,
);
