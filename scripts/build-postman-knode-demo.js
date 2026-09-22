/**
 * Adds the "kNODE Book a Demo" folder to the Postman collection.
 *
 *   node scripts/build-postman-knode-demo.js
 *
 * Idempotent: the folder is matched by name and rewritten in place, so
 * re-running converges on what this file says rather than on whatever happened
 * to be there first.
 *
 * SIX SUBMISSIONS, AND THE CEILING IS TWENTY
 *
 * POST /knode/demo-requests is throttled to twenty per hour per IP, and the
 * throttler runs before validation — so a request that would have failed with
 * a 400 still spends one. Six leaves room to re-run the folder twice inside
 * the hour before the seventh run starts returning 429s that look like a bug
 * in the endpoint rather than the limit working.
 *
 * NOTHING IS HARDCODED FROM THE OPTION LISTS
 *
 * The first request fetches /knode/demo-options and captures the codes every
 * later request uses — including which module is live. That is the endpoint's
 * whole purpose: the website is meant to stop keeping its own copy of these
 * lists, and a Postman folder that kept one would be making the same mistake
 * in miniature.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(
  __dirname,
  '..',
  'docs',
  'veltrixair.postman_collection.json',
);

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

const test = (...exec) => ({
  listen: 'test',
  script: { type: 'text/javascript', exec },
});

const prerequest = (...exec) => ({
  listen: 'prerequest',
  script: { type: 'text/javascript', exec },
});

const events = (before, exec) =>
  before || exec
    ? {
        event: [
          ...(before ? [prerequest(...before)] : []),
          ...(exec ? [test(...exec)] : []),
        ],
      }
    : {};

/** Admin request — collection-level bearer auth applies unless overridden. */
const req = ({
  name,
  method = 'GET',
  path: p,
  site = 101,
  token,
  body,
  description,
  exec,
  before,
}) => ({
  name,
  ...events(before, exec),
  request: {
    ...(token
      ? {
          auth: {
            type: 'bearer',
            bearer: [{ key: 'token', value: token, type: 'string' }],
          },
        }
      : {}),
    method,
    header: [
      { key: 'X-Site-Code', value: String(site) },
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

/** Public request — the website is not signed in. */
const publicReq = ({ name, method = 'GET', path: p, body, description, exec, before }) => ({
  name,
  ...events(before, exec),
  request: {
    auth: { type: 'noauth' },
    method,
    header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    ...(body
      ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } }
      : {}),
    url: url(`{{baseUrl}}${p}`),
    description,
  },
  response: [],
});

/* ------------------------------------------------------------ the site --- */

const OPTIONS = publicReq({
  name: 'Site · Demo options',
  path: '/knode/demo-options',
  description:
    'Every dropdown on the Book a demo form, in one response.\n\n' +
    'The kNODE website currently hardcodes these six lists in its own bundle. ' +
    'Fetching them instead is the point of this endpoint — two copies of a ' +
    'list is exactly how the crane form drifted out of step with its own ' +
    'database, and the module list changes every time something ships.\n\n' +
    '`isLive` on each module is the field that matters: it is what decides ' +
    'whether picking that module means "show me" or "tell me when".\n\n' +
    'Run this first. Every later request in the folder uses the codes it ' +
    'captures, so nothing here repeats a list that lives in the database.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    ``,
    `pm.test("all six lists present", () =>`,
    `  ["modules","facilityTypes","bedBands","opdBands","roles","callWindows"]`,
    `    .forEach((k) => pm.expect(d[k], k).to.be.an("array").that.is.not.empty));`,
    ``,
    `const live = d.modules.filter((m) => m.isLive);`,
    `const unreleased = d.modules.filter((m) => !m.isLive);`,
    ``,
    `pm.test("at least one module has shipped", () => pm.expect(live).to.not.be.empty);`,
    `pm.test("at least one has not", () => pm.expect(unreleased).to.not.be.empty);`,
    ``,
    `// Captured so nothing below hardcodes a code the database owns.`,
    `pm.collectionVariables.set("kdLiveModule", live[0].code);`,
    `pm.collectionVariables.set("kdUnreleasedModule", unreleased[0].code);`,
    `pm.collectionVariables.set("kdFacilityType", d.facilityTypes[0].code);`,
    `pm.collectionVariables.set("kdBedBand", d.bedBands[0].code);`,
    `pm.collectionVariables.set("kdOpdBand", d.opdBands[0].code);`,
    `pm.collectionVariables.set("kdRole", d.roles[0].code);`,
    `pm.collectionVariables.set("kdCallWindow", d.callWindows[0].code);`,
    ``,
    `console.log("Live: " + live.map((m) => m.name).join(", "));`,
    `console.log("Not yet shipped: " + unreleased.map((m) => m.name).join(", "));`,
  ],
});

const SUBMIT_DEMO = publicReq({
  name: 'Site · Submit — a module that has shipped',
  method: 'POST',
  path: '/knode/demo-requests',
  description:
    'Somebody asking about software that exists, with the radio left on its ' +
    'default. The row starts on the pipeline at NEW.\n\n' +
    'Note there is no `intent` field in the body. An absent intent means ' +
    'DEMO — which is what the site’s radio defaults to, and what the short ' +
    'form on a product page implies. Nothing else is consulted: the server ' +
    'never rewrites the visitor’s answer.',
  body: {
    moduleCodes: ['{{kdLiveModule}}'],
    facilityName: 'Sunrise Multispeciality',
    facilityTypeCode: '{{kdFacilityType}}',
    bedBandCode: '{{kdBedBand}}',
    opdBandCode: '{{kdOpdBand}}',
    city: 'Patna',
    contactPerson: 'Dr. Anil Verma',
    contactRoleCode: '{{kdRole}}',
    phone: '9830544127',
    email: 'anil.verma@sunrisehosp.in',
    callWindowCode: '{{kdCallWindow}}',
    notes: '120 beds · currently on paper registers.',
  },
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `const d = pm.response.json().data;`,
    `pm.test("absent intent means DEMO", () => pm.expect(d.intent).to.eql("DEMO"));`,
    `pm.test("reference is KND-DMO-YYYY-NNNN", () =>`,
    `  pm.expect(d.referenceNo).to.match(/^KND-DMO-\\d{4}-\\d{4}$/));`,
    `pm.test("thanked, with no hint of which list they landed in", () =>`,
    `  pm.expect(d.message).to.contain("walkthrough"));`,
    `pm.collectionVariables.set("kdDemoRef", d.referenceNo);`,
  ],
});

const SUBMIT_NOTIFY = publicReq({
  name: 'Site · Submit — the visitor picked "Notify me"',
  method: 'POST',
  path: '/knode/demo-requests',
  description:
    'The same form with the radio moved to "Notify me". That choice alone ' +
    'puts the row in the notify list, and it is the only thing that can.\n\n' +
    'It gets no status at all — a notify row has one fact about it, "have we ' +
    'told them yet", and giving it pipeline stages would invent work nobody ' +
    'does. Whether the module has shipped makes no difference either way; see ' +
    'the next two requests.',
  body: {
    intent: 'NOTIFY',
    moduleCodes: ['{{kdUnreleasedModule}}'],
    facilityName: 'Green Valley Hospital',
    facilityTypeCode: '{{kdFacilityType}}',
    bedBandCode: '{{kdBedBand}}',
    city: 'Gaya',
    contactPerson: 'Mr. Prakash Ranjan',
    phone: '919835270419',
    email: 'director@greenvalleygaya.in',
  },
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `const d = pm.response.json().data;`,
    `pm.test("NOTIFY is honoured", () => pm.expect(d.intent).to.eql("NOTIFY"));`,
    `pm.test("reference is KND-NTF-YYYY-NNNN", () =>`,
    `  pm.expect(d.referenceNo).to.match(/^KND-NTF-\\d{4}-\\d{4}$/));`,
    `pm.test("no status — a notify row is not a ladder", () =>`,
    `  pm.expect(d).to.not.have.property("status"));`,
    `pm.collectionVariables.set("kdNotifyRef", d.referenceNo);`,
  ],
});

const SUBMIT_MIXED = publicReq({
  name: 'Site · Submit — one shipped and one not',
  method: 'POST',
  path: '/knode/demo-requests',
  description:
    'A hospital interested in both. Every module ticked is recorded through ' +
    'the join table, whatever its release state, so "wants HMS now and ' +
    'Pharmacy when it lands" survives as one row rather than two.\n\n' +
    'The 12-digit phone here is the same number as the 10-digit one elsewhere, ' +
    'written with its country code. Both are accepted and stored the same way.',
  body: {
    moduleCodes: ['{{kdLiveModule}}', '{{kdUnreleasedModule}}'],
    facilityName: 'Lifeline Hospital',
    facilityTypeCode: '{{kdFacilityType}}',
    bedBandCode: '{{kdBedBand}}',
    city: 'Ranchi',
    contactPerson: 'Mr. S. K. Jha',
    contactRoleCode: '{{kdRole}}',
    phone: '919431122876',
    email: 'admin@lifelineranchi.com',
    notes: 'Wants the IPD billing walkthrough with the accounts team present.',
  },
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `pm.test("still a demo", () =>`,
    `  pm.expect(pm.response.json().data.intent).to.eql("DEMO"));`,
  ],
});

const SUBMIT_DEMO_UNRELEASED = publicReq({
  name: 'Site · Submit — live demo of something not yet built',
  method: 'POST',
  path: '/knode/demo-requests',
  description:
    'The case the routing used to get wrong, and the reason it changed.\n\n' +
    'Every module here is still in development, and the visitor asked for a ' +
    'live demo anyway. An earlier version rewrote that into a waiting-list ' +
    'entry on the grounds that there is nothing to show — which put the one ' +
    'person actively asking for a conversation into the list nobody works.\n\n' +
    'Now the radio decides and nothing else does. This is a demo request, ' +
    'gets a KND-DMO reference, and starts at NEW. Whoever picks it up can see ' +
    'from `liveModules` on the CREATED event that none of it has shipped, and ' +
    'decide what to show — that is a judgement for a person, not a CHECK ' +
    'constraint.',
  body: {
    intent: 'DEMO',
    moduleCodes: ['{{kdUnreleasedModule}}'],
    facilityName: 'Aarogya Speciality Centre',
    facilityTypeCode: '{{kdFacilityType}}',
    bedBandCode: '{{kdBedBand}}',
    city: 'Muzaffarpur',
    contactPerson: 'Dr. Neha Sinha',
    phone: '9835270418',
    email: 'neha.sinha@aarogyamz.in',
    notes: 'Knows it is not released — wants to see the roadmap build anyway.',
  },
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `const d = pm.response.json().data;`,
    `pm.test("not downgraded — still DEMO", () =>`,
    `  pm.expect(d.intent).to.eql("DEMO"));`,
    `pm.test("reference is KND-DMO-YYYY-NNNN", () =>`,
    `  pm.expect(d.referenceNo).to.match(/^KND-DMO-\\d{4}-\\d{4}$/));`,
  ],
});

const SUBMIT_BAD_PHONE = publicReq({
  name: 'Site · Submit with a bad phone (expect 400)',
  method: 'POST',
  path: '/knode/demo-requests',
  description:
    'Ten digits, or twelve beginning 91. Anything else is refused.\n\n' +
    'The same rule the website runs in the browser — enforced again here, ' +
    'because client-side validation is a courtesy and not a guarantee.',
  body: {
    moduleCodes: ['{{kdLiveModule}}'],
    facilityName: 'Bad Phone Hospital',
    facilityTypeCode: '{{kdFacilityType}}',
    bedBandCode: '{{kdBedBand}}',
    city: 'Pune',
    contactPerson: 'Someone',
    phone: '12345',
    email: 'someone@example.com',
  },
  exec: [
    `pm.test("400", () => pm.response.to.have.status(400));`,
    `const body = pm.response.json();`,
    `pm.test("reported as a validation failure", () =>`,
    `  pm.expect(body.message).to.eql("Validation failed"));`,
    `// The per-field messages ride in data, not in message — the envelope keeps`,
    `// message a single human sentence and puts the list beside it.`,
    `pm.test("says the phone is the problem", () =>`,
    `  pm.expect(JSON.stringify(body.data)).to.contain("phone"));`,
  ],
});

const SUBMIT_UNKNOWN_MODULE = publicReq({
  name: 'Site · Submit an unknown module (expect 400)',
  method: 'POST',
  path: '/knode/demo-requests',
  description:
    'Module codes are checked against the database, not taken on trust. They ' +
    'no longer decide the intent, but they are still what the request is ' +
    'about — a row recording interest in a module that does not exist is a ' +
    'row nobody can act on.\n\n' +
    'This is the sixth and final submission in the folder. The route allows ' +
    'twenty per hour per IP, and the throttle runs before validation, so a ' +
    'rejected request still spends one of them.',
  body: {
    moduleCodes: [9999],
    facilityName: 'Unknown Module Hospital',
    facilityTypeCode: '{{kdFacilityType}}',
    bedBandCode: '{{kdBedBand}}',
    city: 'Pune',
    contactPerson: 'Someone',
    phone: '9830544127',
    email: 'someone@example.com',
  },
  exec: [
    `pm.test("400", () => pm.response.to.have.status(400));`,
    `pm.test("names the code it did not recognise", () =>`,
    `  pm.expect(pm.response.json().message).to.contain("9999"));`,
  ],
});

/* ----------------------------------------------------------- the panel --- */

const STATS = req({
  name: 'Dashboard tiles',
  path: '/admin/knode/demo-requests/stats',
  description:
    'Four counts, taken in the database rather than off one page of rows.\n\n' +
    '`waitingOnLiveModules` is the one worth watching: people still waiting ' +
    'for something that has since shipped. It should be zero, and it is the ' +
    'number nobody would notice growing — a module goes live and the queue it ' +
    'spent months collecting is simply forgotten.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("all four counts present", () =>`,
    `  ["demos","demosNew","waiting","waitingOnLiveModules"]`,
    `    .forEach((k) => pm.expect(d, k).to.have.property(k)));`,
    `console.log(\`Demos \${d.demos} (\${d.demosNew} new) · waiting \${d.waiting} · stale \${d.waitingOnLiveModules}\`);`,
  ],
});

const LIST_DEMOS = req({
  name: 'The demo pipeline',
  path: '/admin/knode/demo-requests?intent=DEMO&page=1&limit=10',
  description:
    'The half of the screen that behaves like a pipeline.\n\n' +
    'The phone and the notes are withheld here, for the same reason the ' +
    'contact list withholds a phone number: a list is glanced at by anyone ' +
    'holding the feature, and a hospital director’s mobile belongs on the ' +
    'record you deliberately opened.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("found the demos just submitted", () => pm.expect(d.total).to.be.above(0));`,
    `pm.test("only demos came back", () =>`,
    `  d.items.forEach((i) => pm.expect(i.intent).to.eql("DEMO")));`,
    `pm.test("every one carries a status", () =>`,
    `  d.items.forEach((i) => pm.expect(i.status).to.be.a("string")));`,
    `pm.test("none is marked notified", () =>`,
    `  d.items.forEach((i) => pm.expect(i.notifiedAt).to.be.null));`,
    `pm.test("phone withheld from the list", () =>`,
    `  d.items.forEach((i) => pm.expect(i.phone).to.be.undefined));`,
    `pm.test("notes withheld from the list", () =>`,
    `  d.items.forEach((i) => pm.expect(i.notes).to.be.undefined));`,
    `pm.collectionVariables.set("kdDemoId", d.items[0].id);`,
  ],
});

const LIST_WAITING = req({
  name: 'The waiting list',
  path: '/admin/knode/demo-requests?intent=NOTIFY&waiting=true',
  description:
    'The other half, and it is not a pipeline.\n\n' +
    'Every row here holds a null status, because there are no stages to be ' +
    'in. `waiting=true` narrows to the ones nobody has told yet.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("someone is waiting", () => pm.expect(d.total).to.be.above(0));`,
    `pm.test("none has a pipeline stage", () =>`,
    `  d.items.forEach((i) => pm.expect(i.status).to.be.null));`,
    `pm.test("none has been told yet", () =>`,
    `  d.items.forEach((i) => pm.expect(i.notifiedAt).to.be.null));`,
    `pm.collectionVariables.set("kdNotifyId", d.items[0].id);`,
  ],
});

const WAITING_BY_MODULE = req({
  name: 'Waiting list, per module',
  path: '/admin/knode/demo-requests/waiting-by-module',
  description:
    'How the waiting list is actually worked: by release, not by row. When a ' +
    'module ships you want one number — how many people have been waiting for ' +
    'this — and then one action.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("at least one module has a queue", () => pm.expect(d).to.not.be.empty);`,
    `pm.test("each row names its module and its count", () =>`,
    `  d.forEach((r) => {`,
    `    pm.expect(r.moduleName).to.be.a("string");`,
    `    pm.expect(r.waiting).to.be.a("number");`,
    `  }));`,
    `console.log(d.map((r) => \`\${r.moduleName}: \${r.waiting}\`).join(" · "));`,
  ],
});

const SEARCH = req({
  name: 'Search',
  path: '/admin/knode/demo-requests?search=Sunrise',
  description:
    'Case-insensitive across facility name, contact person, city and ' +
    'reference — the four things somebody would have written on a notepad.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `pm.test("found it", () => pm.expect(pm.response.json().data.total).to.be.above(0));`,
  ],
});

const FIND_ONE = req({
  name: 'One request in full',
  path: '/admin/knode/demo-requests/{{kdDemoId}}',
  description:
    'The detail screen. Unlike the list this returns the phone, the notes, ' +
    'and the modules asked about with their master rows joined — which is the ' +
    'whole reason the list does not.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("phone is returned here", () => pm.expect(d.phone).to.be.a("string"));`,
    `pm.test("the modules asked about are joined in", () =>`,
    `  pm.expect(d.modules).to.be.an("array").that.is.not.empty);`,
    `pm.test("each module carries its master row", () =>`,
    `  pm.expect(d.modules[0].module.moduleName).to.be.a("string"));`,
    `pm.test("the facility type is resolved, not just a code", () =>`,
    `  pm.expect(d.facilityType.facilityTypeLabel).to.be.a("string"));`,
  ],
});

const EVENTS = req({
  name: 'Timeline',
  path: '/admin/knode/demo-requests/{{kdDemoId}}/events',
  description:
    'Append-only. The CREATED entry records which modules were picked and ' +
    'which of them were live — the reason this became a demo rather than a ' +
    'waiting-list entry, kept so it is still answerable months later.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("CREATED is on the timeline", () =>`,
    `  pm.expect(d.some((e) => e.eventType === "CREATED")).to.be.true);`,
    `const created = d.find((e) => e.eventType === "CREATED");`,
    `pm.test("it records why the intent was chosen", () =>`,
    `  pm.expect(created.metadata).to.have.property("liveModules"));`,
  ],
});

const STATUS_OK = req({
  name: 'Move a demo along its ladder',
  method: 'PATCH',
  path: '/admin/knode/demo-requests/{{kdDemoId}}/status',
  body: { status: 'DEMO_SCHEDULED', note: 'Tuesday 11am, their IT lead joining.' },
  description:
    'A demo can be: NEW, CONTACTED, DEMO_SCHEDULED, DEMO_DONE, WON, LOST.\n\n' +
    'The note is kept on the timeline entry rather than on the request — a ' +
    'reason belongs to the change, not to the record.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `pm.test("status moved", () =>`,
    `  pm.expect(pm.response.json().data.status).to.eql("DEMO_SCHEDULED"));`,
  ],
});

const STATUS_ON_NOTIFY = req({
  name: 'Give a waiting-list entry a stage (expect 400)',
  method: 'PATCH',
  path: '/admin/knode/demo-requests/{{kdNotifyId}}/status',
  body: { status: 'DEMO_SCHEDULED' },
  description:
    'A notify request has no pipeline, so it cannot be moved along one.\n\n' +
    'This matters beyond tidiness: a waiting-list entry marked DEMO_SCHEDULED ' +
    'would sit in the pipeline as work somebody believes is underway, and ' +
    'nobody would be booked for it. Refused by the service and, independently, ' +
    'by a CHECK constraint — so a client bypassing the API cannot write it ' +
    'either.',
  exec: [
    `pm.test("400", () => pm.response.to.have.status(400));`,
    `pm.test("points at the right action instead", () =>`,
    `  pm.expect(pm.response.json().message).to.contain("mark it notified"));`,
  ],
});

const MARK_NOTIFIED = req({
  name: 'The module ships — tell everyone waiting',
  method: 'POST',
  path: '/admin/knode/demo-requests/mark-notified',
  body: {
    moduleCode: '{{kdUnreleasedModule}}',
    note: 'Released today — announcement sent to the waiting list.',
  },
  description:
    'The waiting list’s only action, and deliberately bulk.\n\n' +
    'A release happens once, so the queue it collected is cleared in one call ' +
    'rather than walked row by row — which is both tedious and a way to miss ' +
    'somebody. Every affected row gets its own NOTIFIED timeline entry, so ' +
    '"we told the Pharmacy list" stays a record rather than a claim.',
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `const d = pm.response.json().data;`,
    `pm.test("somebody was told", () => pm.expect(d.notified).to.be.above(0));`,
    `pm.collectionVariables.set("kdNotifiedCount", d.notified);`,
    `console.log("Notified " + d.notified + " waiting for module " + d.moduleCode);`,
  ],
});

const MARK_NOTIFIED_AGAIN = req({
  name: 'Run it again — nobody is told twice',
  method: 'POST',
  path: '/admin/knode/demo-requests/mark-notified',
  body: { moduleCode: '{{kdUnreleasedModule}}' },
  description:
    'Already-notified rows are skipped rather than re-stamped, so running ' +
    'this twice after a partial send is safe — which matters, because the ' +
    'realistic failure is a mail run that died halfway and somebody pressing ' +
    'the button again.',
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `pm.test("nothing left to do", () =>`,
    `  pm.expect(pm.response.json().data.notified).to.eql(0));`,
  ],
});

const ASSIGN = req({
  name: 'Assign a request',
  method: 'PATCH',
  path: '/admin/knode/demo-requests/{{kdDemoId}}/assign',
  body: { assignedTo: '{{salesEmail}}' },
  description: 'Send null to hand it back to the pool. Both directions are recorded.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `pm.test("owner set", () =>`,
    `  pm.expect(pm.response.json().data.assignedTo).to.be.a("string"));`,
  ],
});

const ADD_NOTE = req({
  name: 'Add an internal note',
  method: 'POST',
  path: '/admin/knode/demo-requests/{{kdDemoId}}/notes',
  body: {
    note: 'Asked for a pricing comparison against their current desktop software.',
  },
  description:
    'Notes are timeline entries, not a field on the request — so they are ' +
    'append-only and each keeps its author and its moment.',
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `pm.test("recorded as NOTE_ADDED", () =>`,
    `  pm.expect(pm.response.json().data.eventType).to.eql("NOTE_ADDED"));`,
  ],
});

/* --------------------------------------------------------- the refusals --- */

const WRONG_SITE = req({
  name: 'Crane admin reaches for it (expect 403)',
  path: '/admin/knode/demo-requests',
  site: 102,
  token: '{{craneToken}}',
  description:
    'kNODE is an IT-unit product, so the scope is hard rather than a filter: ' +
    'a crane administrator is refused outright rather than shown an empty ' +
    'list. An empty list would suggest there is nothing to see; a 403 says ' +
    'correctly that this is somebody else’s dashboard.\n\n' +
    'Run the RBAC & Security folder first — it populates craneToken.',
  exec: [
    `pm.test("403", () => pm.response.to.have.status(403));`,
    `pm.test("points at the right dashboard", () =>`,
    `  pm.expect(pm.response.json().message).to.contain("another dashboard"));`,
  ],
});

const WRONG_ROLE = req({
  name: 'Viewer on IT reaches for it (expect 403)',
  path: '/admin/knode/demo-requests',
  token: '{{viewerToken}}',
  description:
    'KNODE_DEMO (feature 115) is granted to Super Admin and Sales only.\n\n' +
    'Deliberately not to Viewer, which reads most things: this is a ' +
    'hospital’s bed count, its daily outpatient footfall and the mobile ' +
    'number of the person who runs it.\n\n' +
    'Run the RBAC & Security folder first — it populates viewerToken.',
  exec: [
    `pm.test("403", () => pm.response.to.have.status(403));`,
    `pm.test("names the feature", () =>`,
    `  pm.expect(pm.response.json().message).to.contain("115"));`,
  ],
});

/* ------------------------------------------------------------- assembly --- */

const FOLDER = {
  name: 'kNODE Book a Demo',
  description:
    '"Book a demo" on knode.veltrixair.com.\n\n' +
    'One form that collects two different things, and the visitor decides ' +
    'which. "Live demo" is a pipeline: NEW through to WON or LOST. "Notify ' +
    'me" is a list with no stages at all, because a name waiting for a release ' +
    'has exactly one fact about it — whether we have told them yet.\n\n' +
    'The radio is the only input. Whether the modules picked have shipped ' +
    'changes nothing about where the row lands, and the folder proves that in ' +
    'both directions: a demo of something unbuilt stays a demo, and a "notify ' +
    'me" about something live stays a notify. The server used to override the ' +
    'first of those, and the row it hid was the best lead on the board.\n\n' +
    'The folder also proves neither half can borrow the other’s lifecycle.\n\n' +
    'RUN IN ORDER. The first request captures every option code the rest use; ' +
    'the submissions create the rows the panel requests then read.\n\n' +
    'SIX SUBMISSIONS, AGAINST A CEILING OF TWENTY. POST /knode/demo-requests ' +
    'allows twenty per hour per IP, and the throttler runs before validation — ' +
    'so even a request meant to fail spends one. The folder can be run three ' +
    'times inside the hour; the fourth will 429 on the submissions, and the ' +
    'admin half still works.\n\n' +
    'Sign in as Super Admin or Sales on site 101 first. Viewer is refused by ' +
    'design, and the last two requests need craneToken and viewerToken from ' +
    'the RBAC & Security folder.',
  item: [
    OPTIONS,
    SUBMIT_DEMO,
    SUBMIT_NOTIFY,
    SUBMIT_MIXED,
    SUBMIT_DEMO_UNRELEASED,
    SUBMIT_BAD_PHONE,
    SUBMIT_UNKNOWN_MODULE,
    STATS,
    LIST_DEMOS,
    LIST_WAITING,
    WAITING_BY_MODULE,
    SEARCH,
    FIND_ONE,
    EVENTS,
    STATUS_OK,
    STATUS_ON_NOTIFY,
    MARK_NOTIFIED,
    MARK_NOTIFIED_AGAIN,
    ASSIGN,
    ADD_NOTE,
    WRONG_SITE,
    WRONG_ROLE,
  ],
};

const NEW_VARIABLES = [
  'kdLiveModule',
  'kdUnreleasedModule',
  'kdFacilityType',
  'kdBedBand',
  'kdOpdBand',
  'kdRole',
  'kdCallWindow',
  'kdDemoRef',
  'kdNotifyRef',
  'kdDemoId',
  'kdNotifyId',
  'kdNotifiedCount',
];

const collection = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const changes = [];

const at = collection.item.findIndex((f) => f.name === FOLDER.name);
if (at === -1) {
  // Beside Discovery, the other IT-unit module and its nearest neighbour.
  const anchor = collection.item.findIndex((f) => f.name === 'Discovery');
  const insertAt = anchor === -1 ? collection.item.length : anchor + 1;
  collection.item.splice(insertAt, 0, FOLDER);
  changes.push(`added folder    ${FOLDER.name} (${FOLDER.item.length} requests)`);
} else {
  collection.item[at] = FOLDER;
  changes.push(`updated folder  ${FOLDER.name} (${FOLDER.item.length} requests)`);
}

collection.variable = collection.variable ?? [];
for (const key of NEW_VARIABLES) {
  if (!collection.variable.some((v) => v.key === key)) {
    collection.variable.push({ key, value: '' });
    changes.push(`added variable  ${key}`);
  }
}

fs.writeFileSync(FILE, `${JSON.stringify(collection, null, 2)}\n`);

changes.forEach((c) => console.log(`  ${c}`));
console.log(
  `\n  collection now has ${collection.item.length} folders, ` +
    `${collection.item.reduce((n, f) => n + (f.item?.length ?? 1), 0)} requests`,
);
