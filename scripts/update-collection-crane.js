/**
 * Adds the Crane Quotes folder to the Postman collection.
 *
 *   node scripts/update-collection-crane.js
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
  { key: 'quoteId', value: '', type: 'string' },
  { key: 'quoteManageToken', value: '', type: 'string' },
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
const url = (segments) => ({
  raw: `{{baseUrl}}/${segments.join('/')}`,
  host: ['{{baseUrl}}'],
  path: segments,
});

/** The quote form as multipart. Section 04 travels as a JSON string. */
const quoteFormData = (overrides = {}) => {
  const base = {
    serviceLineCode: ['103', '103 = Crane Dismantling & Decommissioning'],
    urgencyCode: ['103', '103 = Standard, within 1-3 months'],
    leadSourceCode: ['102', 'Referral'],
    additionalServiceCodes: ['104,105', 'Comma-separated, or repeat the field'],
    companyName: ['Jubail Steel Works', ''],
    industryCode: ['203', 'Steel & Metals — note the 2xx range is the CRANE list'],
    contactName: ['Khalid Al-Amri', ''],
    contactPosition: ['Maintenance Manager', ''],
    businessEmail: ['k.alamri@example.com', ''],
    mobile: ['+966 55 987 6543', 'WhatsApp preferred'],
    existingClient: ['NO', 'NO | ACTIVE_AMC | PAST_PROJECTS | UNSURE'],
    preferredContact: ['WHATSAPP', 'EMAIL | PHONE | WHATSAPP | SITE_VISIT | VIDEO'],
    siteCityCode: ['107', 'Jubail'],
    siteAccessCode: ['106', 'Royal Commission city — weeks of clearance'],
    craneCount: ['2', ''],
    craneTypeCode: ['108', 'Process Crane (Steel / Foundry / Hot Metal)'],
    oemCode: ['101', 'Demag (Konecranes)'],
    swlTonnes: ['50', ''],
    yearOfManufacture: ['1998', 'Pre-2000 — drives the hazmat question'],
    environmentCode: ['105', 'Hot metal / foundry'],
    dutyClassCode: ['106', 'FEM 5m / ISO M8'],
    scopeDetail: [
      JSON.stringify({
        reason: 'END_OF_LIFE',
        hazmatSuspected: 'SUSPECTED_PRE_2000',
        assetDisposition: 'SCRAP_RECOVERY',
        documentation: 'PARTIAL',
      }),
      'Section 04 — the questionnaire for THIS service line. See quote-options.',
    ],
    budgetBandCode: ['104', 'SAR 1M — 5M'],
    completionTimelineCode: ['104', '1 — 3 months'],
    procurementCode: ['102', 'RFQ / formal quote'],
    paymentTermsCode: ['103', 'Milestone-based'],
    requiredDocumentCodes: ['101,102,108', 'Technical, pricing, HSE/RAMS'],
    projectDescription: [
      'Two 50t hot metal cranes at end of design life in the Jubail melt shop.',
      '',
    ],
    constraintsConcerns: ['Adjacent bay stays live throughout.', ''],
    consentGiven: ['true', 'Required. PDPL consent — "false" is correctly rejected.'],
    marketingOptIn: ['true', 'Optional — quarterly KSA regulatory update.'],
  };

  const fields = Object.entries({ ...base, ...overrides }).map(
    ([key, [value, description]]) => ({
      key,
      value,
      type: 'text',
      ...(description ? { description } : {}),
    }),
  );

  fields.push({
    key: 'attachments',
    type: 'file',
    src: [],
    description:
      'Optional, up to 10 files, 20 MB each. PDF / DOC / DOCX, verified by magic bytes.',
  });

  return fields;
};

const folder = {
  name: 'Crane Quotes',
  description:
    'Request a Quote — veltrixairindustries.com/quote/ (site 102).\n\n' +
    'The largest form in the system: five sections, ~50 fields. Two things are ' +
    'worth understanding before you send anything.\n\n' +
    '**Section 04 is conditional.** Six questionnaires, one per service line, ' +
    'and only one applies. It travels as a JSON string in `scopeDetail`, and is ' +
    'validated against the schema for the service line you picked — an unknown ' +
    'key, an unknown value, or an answer from a different service line is a 400. ' +
    'Run "Quote options" to see which questions belong to which line.\n\n' +
    '**Priority is derived, not submitted.** Urgency is asked of everyone; the ' +
    'P1 question only appears for breakdown response. So urgency is the primary ' +
    'signal — someone can pick Installation + Emergency and never see the P1 ' +
    'question, and they still route as P1.\n\n' +
    'Admin routes need CRANE_QUOTES (108), held by SALES and SUPER_ADMIN, with ' +
    'VIEWER able to read. Sign in with `siteCode: 102`.',
  item: [
    {
      name: 'Quote options',
      event: [
        script([
          'const d = pm.response.json().data;',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('7 service lines', () => pm.expect(d.serviceLines.length).to.eql(7));",
          "pm.test('industries are the crane list', () => pm.expect(d.industries[0].code).to.be.at.least(201));",
          'console.log("Service lines:\\n" + d.serviceLines.map((s) => `${s.code} ${s.label}`).join("\\n"));',
          'console.log("Section 04 questions per line:\\n" + JSON.stringify(d.scopeQuestions, null, 2));',
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'GET',
        header: [],
        url: url(['crane', 'quote-options']),
        description:
          'Every dropdown, plus `scopeQuestions` — the permitted section-04 ' +
          'keys and values for each service line. The frontend renders the ' +
          'conditional section from this rather than hardcoding it.',
      },
    },
    {
      name: 'Submit a quote request',
      event: [
        script([
          'const d = pm.response.json().data;',
          "pm.test('201 created', () => pm.response.to.have.status(201));",
          "pm.test('VTX-RFQ reference issued', () => pm.expect(d.referenceNo).to.match(/^VTX-RFQ-\\d{4}-\\d{4}$/));",
          "pm.collectionVariables.set('quoteManageToken', d.manageToken);",
          'console.log(`${d.referenceNo} — priority ${d.priority}, proposal due ${d.proposalDueAt}`);',
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [],
        body: { mode: 'formdata', formdata: quoteFormData() },
        url: url(['crane', 'quotes']),
        description:
          '10 per hour per IP — a customer reasonably submits more than once, ' +
          'and rejected attempts count too.\n\n' +
          'Attachments are uploaded only after every code and the scope schema ' +
          'have passed, so a rejected submission never leaves an orphan file.\n\n' +
          'SLA due dates are computed in **KSA working days** (Sunday–Thursday), ' +
          'so a Thursday afternoon request is not due back on Saturday.',
      },
    },
    {
      name: 'Submit a P1 production stop',
      event: [
        script([
          'const d = pm.response.json().data;',
          "pm.test('201 — accepted, not refused', () => pm.response.to.have.status(201));",
          "pm.test('routed P1', () => pm.expect(d.priority).to.eql('P1'));",
          "pm.test('hotline surfaced', () => pm.expect(d.hotline).to.be.a('string'));",
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [],
        body: {
          mode: 'formdata',
          formdata: quoteFormData({
            serviceLineCode: ['106', '24/7 Breakdown Response'],
            urgencyCode: ['101', 'Emergency — production stopped'],
            scopeDetail: [
              JSON.stringify({
                craneDownNow: 'P1_PRODUCTION_STOP',
                engagementPurpose: 'ACTIVE_EMERGENCY',
                faultDescription: 'Hoist brake failure, line stopped.',
              }),
              'The breakdown questionnaire',
            ],
          }),
        },
        url: url(['crane', 'quotes']),
        description:
          'The form says "CALL HOTLINE INSTEAD", but the submission is still ' +
          'accepted — someone who has typed fifty fields while their plant is ' +
          'stopped should not be told to start again, and the form is useful ' +
          'context for whoever answers the phone.\n\n' +
          'What changes: priority P1, SLA due dates collapse to now, an ' +
          'ESCALATED event is written on arrival, and the response leads with ' +
          'the hotline number rather than a callback promise.',
      },
    },
    {
      name: 'Scope answer from the wrong service line (expect 400)',
      event: [
        script(["pm.test('400 bad request', () => pm.response.to.have.status(400));"]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [],
        body: {
          mode: 'formdata',
          formdata: quoteFormData({
            scopeDetail: [
              JSON.stringify({ inspectionType: 'ANNUAL_SASO' }),
              'An inspection answer sent with a dismantling service line',
            ],
          }),
        },
        url: url(['crane', 'quotes']),
        description:
          'This is what replaces the foreign keys a JSONB column cannot have. ' +
          'Unknown keys, unknown values and missing required answers are all ' +
          'rejected the same way.',
      },
    },
    {
      name: 'Track my request (customer)',
      event: [
        script([
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('no commercial detail leaked', () => {",
          '  const body = JSON.stringify(pm.response.json());',
          "  pm.expect(body).to.not.include('budget');",
          "  pm.expect(body).to.not.include('mobile');",
          '});',
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'GET',
        header: [],
        url: url(['crane', 'quotes', '{{quoteManageToken}}']),
        description:
          'No account — the token from the acknowledgement email is the ' +
          'credential. Returns status and the proposal due date, nothing else.',
      },
    },
    {
      name: 'List quote requests (admin)',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          'if (body.data.items && body.data.items.length) {',
          "  pm.collectionVariables.set('quoteId', body.data.items[0].id);",
          '}',
          "pm.test('no commercial detail in the list', () => {",
          '  (body.data.items || []).forEach((q) => {',
          "    pm.expect(q).to.not.have.property('mobile');",
          "    pm.expect(q).to.not.have.property('budgetBandCode');",
          "    pm.expect(q).to.not.have.property('constraintsConcerns');",
          '  });',
          '});',
        ]),
      ],
      request: {
        method: 'GET',
        header: [],
        url: {
          raw: '{{baseUrl}}/admin/crane-quotes?page=1&limit=10',
          host: ['{{baseUrl}}'],
          path: ['admin', 'crane-quotes'],
          query: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' },
            { key: 'priority', value: 'P1', disabled: true },
            { key: 'status', value: 'NEW', disabled: true },
            { key: 'serviceLineCode', value: '103', disabled: true },
            { key: 'siteCityCode', value: '107', disabled: true },
            { key: 'overdue', value: 'true', disabled: true, description: 'Past triage, still untouched' },
            { key: 'search', value: 'jubail', disabled: true },
          ],
        },
        description:
          'Ordered worst priority first, then oldest — the order a responder ' +
          'works in.\n\n' +
          'Budget band, payment terms, mobile and the constraints note are ' +
          'withheld at the column level. A quote pipeline is commercially ' +
          'sensitive, and a list is the easiest place to leak it by omission.',
      },
    },
    {
      name: 'Get one quote request (admin)',
      request: {
        method: 'GET',
        header: [],
        url: url(['admin', 'crane-quotes', '{{quoteId}}']),
        description:
          'The full record, including the commercial columns the list holds ' +
          'back, every joined master name, section 04, and the attachments.',
      },
    },
    {
      name: 'Move through the pipeline',
      event: [script(["pm.test('200 OK', () => pm.response.to.have.status(200));"])],
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ status: 'SITE_VISIT', note: 'Survey booked for Sunday.' }),
        url: url(['admin', 'crane-quotes', '{{quoteId}}', 'status']),
        description:
          'NEW → TRIAGE → SITE_VISIT → PROPOSAL_SENT → WON / LOST.\n\n' +
          'The first move off NEW stamps `firstRespondedAt`, which stops the ' +
          'triage clock and takes the request out of the overdue list. ' +
          'WITHDRAWN is rejected here — that belongs to the customer.',
      },
    },
    {
      name: 'Assign to an engineer',
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ assignedTo: 'engineer@veltrixair.com' }),
        url: url(['admin', 'crane-quotes', '{{quoteId}}', 'assign']),
      },
    },
    {
      name: 'Add an internal note',
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ note: 'Client confirmed Aramco clearance already held.' }),
        url: url(['admin', 'crane-quotes', '{{quoteId}}', 'notes']),
      },
    },
    {
      name: 'Download an attachment',
      request: {
        method: 'GET',
        header: [],
        url: url([
          'admin',
          'crane-quotes',
          '{{quoteId}}',
          'attachments',
          'PASTE_A_FILE_ID_FROM_THE_QUOTE',
        ]),
        description:
          'Short-lived signed URL, and an ATTACHMENT_VIEWED event naming who ' +
          'asked. File ids come from the `attachments` array on the full record.',
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
        url: url(['admin', 'crane-quotes', '{{quoteId}}', 'events']),
        description:
          'Every status change, note, attachment download and escalation. A P1 ' +
          'writes ESCALATED on arrival, so the trail shows the alarm was raised ' +
          'even before anyone opened the record.',
      },
    },
  ],
};

collection.item = collection.item.filter((i) => i.name !== 'Crane Quotes');

// After Applications — it is another lead pipeline, and the site-specific
// modules sit after the shared ones.
const anchor = collection.item.findIndex((i) => i.name === 'Applications');
collection.item.splice(anchor + 1, 0, folder);

fs.writeFileSync(FILE, JSON.stringify(collection, null, 2) + '\n');

let count = 0;
(function walk(items) {
  for (const i of items) {
    if (Array.isArray(i.item)) walk(i.item);
    else count++;
  }
})(collection.item);

console.log(`Crane Quotes folder: ${folder.item.length} requests`);
console.log(`collection total:    ${count} requests`);
console.log(`folders: ${collection.item.map((i) => i.name).join(' | ')}`);
