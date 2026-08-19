/**
 * Adds the Crane Site Visits folder to the Postman collection.
 *
 *   node scripts/update-collection-site-visits.js
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
  { key: 'siteVisitId', value: '', type: 'string' },
  { key: 'siteVisitToken', value: '', type: 'string' },
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
const CRANE_HEADER = {
  key: 'X-Site-Code',
  value: '102',
  description: 'Veltrixair Industries — overrides the collection default',
};
const url = (segments) => ({
  raw: `{{baseUrl}}/${segments.join('/')}`,
  host: ['{{baseUrl}}'],
  path: segments,
});

const SAMPLE = {
  visitPurposeCode: 104,
  visitUrgencyCode: 101,
  serviceLineCode: 105,
  engineerFocus:
    'Hoist brake wear on the 50t process crane in bay 3, plus general structural condition.',
  companyName: 'Yanbu Refinery Co',
  industryCode: 202,
  contactName: 'Omar Al-Zahrani',
  contactPosition: 'Reliability Engineer',
  businessEmail: 'omar.alzahrani@example.com',
  mobile: '+966 55 111 2222',
  existingClient: 'EVALUATING',
  leadSourceCode: 104,
  siteCityCode: 108,
  siteAccessCode: 106,
  siteAddress: 'Plant 4, Yanbu Industrial City',
  siteContactName: 'Gate Security',
  siteContactPhone: '+966 55 333 4444',
  craneCount: 3,
  craneTypeCode: 108,
  oemCode: 101,
  ageBandCode: 104,
  environmentCode: 105,
  preferredDates: 'Any Sunday after Eid',
  avoidDates: 'Last week of the month — shutdown',
  visitDurationCode: 103,
  visitTimeCode: 101,
  attendees: 'Reliability engineer, maintenance supervisor',
  agendaItems: 'Brake condition, rope wear, structural survey',
  accessApprovalCode: 102,
  engineerVisaCode: 101,
  ppeProviderCode: 101,
  hotWorkCode: 102,
  translatorCode: 102,
  engagementTypeCode: 101,
  siteConstraints: 'Adjacent bay live throughout.',
  consentGiven: true,
  photographyConsent: true,
  marketingOptIn: false,
};

const folder = {
  name: 'Crane Site Visits',
  description:
    '"Bring an engineer, before we bring a quote." — veltrixairindustries.com/site-visit/\n\n' +
    'Simpler than the quote form despite being a similar size: no conditional ' +
    'questionnaire, so no JSONB, and no file upload, so ordinary JSON rather ' +
    'than multipart.\n\n' +
    '**Eight of the dropdowns are reused from the quote form** — service line, ' +
    'industry, city, access regime, crane type, OEM, environment, lead source. ' +
    'The two pages render them slightly differently, but a crane is a crane ' +
    'whichever form you arrived on, and two near-identical tables is how you ' +
    'add an OEM to one and forget the other.\n\n' +
    'Admin routes need CRANE_SITE_VISITS (109) — its own feature rather than ' +
    "the quote pipeline's, because the page describes visits as engineer-led " +
    'and quotes as sales-led. Held by SALES and SUPER_ADMIN today.',
  item: [
    {
      name: 'Site visit options',
      event: [
        script([
          'const d = pm.response.json().data;',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('10 visit purposes', () => pm.expect(d.visitPurposes.length).to.eql(10));",
          "pm.test('crane types reused from the quote form', () => pm.expect(d.craneTypes.length).to.eql(14));",
          'console.log("Purposes:\\n" + d.visitPurposes.map((p) => `${p.code} ${p.label}`).join("\\n"));',
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'GET',
        header: [CRANE_HEADER],
        url: url(['crane', 'site-visit-options']),
        description:
          'Nineteen lists: eleven specific to a visit (purpose, duration, PPE, ' +
          'permits, translator, engagement type…) and eight shared with the ' +
          'quote form.',
      },
    },
    {
      name: 'Request a site visit',
      event: [
        script([
          'const d = pm.response.json().data;',
          "pm.test('201 created', () => pm.response.to.have.status(201));",
          "pm.test('VTX-VST reference issued', () => pm.expect(d.referenceNo).to.match(/^VTX-VST-\\d{4}-\\d{4}$/));",
          "pm.collectionVariables.set('siteVisitToken', d.manageToken);",
          'console.log(`${d.referenceNo} — coordinate by ${d.coordinationDueAt}, report by ${d.reportDueAt}`);',
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [
          { key: 'Content-Type', value: 'application/json' },
          CRANE_HEADER,
        ],
        body: json(SAMPLE),
        url: url(['crane', 'site-visits']),
        description:
          'Only four fields are required: purpose, urgency, what the engineer ' +
          'should focus on, and the company/contact block.\n\n' +
          '`quoteId` is optional — set it when the visit is being scoped out of ' +
          'a quote enquiry that already exists.\n\n' +
          'Two clocks start: the coordination call is **48 clock hours** (the ' +
          'page says "within 48 hours", not two working days), while the ' +
          'assessment report is **5 KSA working days**, Sunday–Thursday.\n\n' +
          '`preferredDates` and `avoidDates` are free text on purpose — "after ' +
          'Eid" and "w/c 14th" are real answers a date picker would refuse.',
      },
    },
    {
      name: 'Request without consent (expect 400)',
      event: [
        script(["pm.test('400 bad request', () => pm.response.to.have.status(400));"]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [
          { key: 'Content-Type', value: 'application/json' },
          CRANE_HEADER,
        ],
        body: json({ ...SAMPLE, consentGiven: false }),
        url: url(['crane', 'site-visits']),
        description:
          'The PDPL consent is required. Photography consent is separate and ' +
          'optional — on a defence or Aramco site, whether an engineer may take ' +
          'photographs is a different question from whether you may hold ' +
          "someone's contact details.",
      },
    },
    {
      name: 'Track my request (customer)',
      event: [
        script([
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('no site access detail leaked', () => {",
          '  const body = JSON.stringify(pm.response.json());',
          "  pm.expect(body).to.not.include('siteAddress');",
          "  pm.expect(body).to.not.include('siteContactPhone');",
          '});',
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'GET',
        header: [CRANE_HEADER],
        url: url(['crane', 'site-visits', '{{siteVisitToken}}']),
        description:
          'Status and the confirmed date, nothing else. No account — the token ' +
          'from the acknowledgement email is the credential.',
      },
    },
    {
      name: 'List visit requests (admin)',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          'if (body.data.items && body.data.items.length) {',
          "  pm.collectionVariables.set('siteVisitId', body.data.items[0].id);",
          '}',
          "pm.test('no site access detail in the list', () => {",
          '  (body.data.items || []).forEach((v) => {',
          "    pm.expect(v).to.not.have.property('siteAddress');",
          "    pm.expect(v).to.not.have.property('siteContactPhone');",
          "    pm.expect(v).to.not.have.property('mobile');",
          '  });',
          '});',
        ]),
      ],
      request: {
        method: 'GET',
        header: [],
        url: {
          raw: '{{baseUrl}}/admin/crane-site-visits?page=1&limit=10',
          host: ['{{baseUrl}}'],
          path: ['admin', 'crane-site-visits'],
          query: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' },
            { key: 'status', value: 'NEW', disabled: true },
            { key: 'visitPurposeCode', value: '104', disabled: true },
            { key: 'visitUrgencyCode', value: '101', disabled: true, description: 'This week' },
            { key: 'siteCityCode', value: '108', disabled: true },
            { key: 'engagementTypeCode', value: '102', disabled: true, description: 'Billable assessments only' },
            { key: 'overdue', value: 'true', disabled: true, description: 'Past 48h, still untouched' },
            { key: 'search', value: 'yanbu', disabled: true },
          ],
        },
        description:
          'Soonest wanted first, then oldest.\n\n' +
          'Site address, gate contact and mobile are withheld at the column ' +
          'level. A list of visits is a list of industrial sites and the people ' +
          'who let you into them — not something a table view needs to carry.',
      },
    },
    {
      name: 'Get one visit request (admin)',
      request: {
        method: 'GET',
        header: [],
        url: url(['admin', 'crane-site-visits', '{{siteVisitId}}']),
        description:
          'The full record: every joined master name, the access and compliance ' +
          'answers the engineer needs before travelling, and the linked quote ' +
          'if the visit was scoped out of one.',
      },
    },
    {
      name: 'Schedule the visit',
      event: [
        script([
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('moved to SCHEDULED in the same call', () => pm.expect(pm.response.json().data.status).to.eql('SCHEDULED'));",
        ]),
      ],
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({
          scheduledAt: '2026-09-14T07:00:00.000Z',
          assignedEngineer: 'engineer@veltrixair.com',
          note: 'Confirmed with the plant; gate pass arranged.',
        }),
        url: url(['admin', 'crane-site-visits', '{{siteVisitId}}', 'schedule']),
        description:
          'Confirming a date also moves the status and stops the 48-hour clock. ' +
          'A confirmed date that left the status behind is how a coordinator ' +
          'ends up chasing something already in the diary.\n\n' +
          'Writes its own SCHEDULED event rather than a status diff, because ' +
          '"when did you say you were coming?" is easier to answer from that.',
      },
    },
    {
      name: 'Move through the pipeline',
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ status: 'COMPLETED', note: 'Survey done, report drafting.' }),
        url: url(['admin', 'crane-site-visits', '{{siteVisitId}}', 'status']),
        description:
          'NEW → COORDINATING → SCHEDULED → COMPLETED → REPORT_SENT, or ' +
          'CANCELLED. A cancelled request cannot be reopened.',
      },
    },
    {
      name: 'Assign an engineer',
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ assignedEngineer: 'engineer@veltrixair.com' }),
        url: url(['admin', 'crane-site-visits', '{{siteVisitId}}', 'assign']),
      },
    },
    {
      name: 'Add an internal note',
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ note: 'Client confirmed HCIS clearance already held.' }),
        url: url(['admin', 'crane-site-visits', '{{siteVisitId}}', 'notes']),
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
        url: url(['admin', 'crane-site-visits', '{{siteVisitId}}', 'events']),
      },
    },
  ],
};

collection.item = collection.item.filter((i) => i.name !== 'Crane Site Visits');
const anchor = collection.item.findIndex((i) => i.name === 'Crane Quotes');
collection.item.splice(anchor + 1, 0, folder);

fs.writeFileSync(FILE, JSON.stringify(collection, null, 2) + '\n');

let count = 0;
(function walk(items) {
  for (const i of items) {
    if (Array.isArray(i.item)) walk(i.item);
    else count++;
  }
})(collection.item);

console.log(`Crane Site Visits folder: ${folder.item.length} requests`);
console.log(`collection total:         ${count} requests`);
