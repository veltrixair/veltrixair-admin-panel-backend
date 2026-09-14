/**
 * Adds the Knode Product Deck folder to the Postman collection.
 *
 *   node scripts/build-postman-knode.js
 *
 * Idempotent, in the same way as build-postman-staff.js: the folder is matched
 * by name and rewritten in place rather than appended, so re-running converges
 * on what this file says instead of on whatever happened to be there first.
 *
 * WHY THIS FOLDER IS SHAPED DIFFERENTLY FROM THE OTHERS
 *
 * Every other public folder posts a website form. This one posts from the
 * Knode HMS sales deck running on a rep's laptop, which changes two things the
 * requests have to demonstrate:
 *
 *   Idempotency. The deck queues leads offline and replays the queue, so the
 *   same clientKey arriving twice must not create two rows. Request 2 reuses
 *   the key request 1 generated, and asserts `created: false`.
 *
 *   Two status ladders on one table. A booked demo and a signed client share
 *   only NEW, so the folder proves both that the right ladder is accepted and
 *   that the wrong one is refused.
 *
 * MEETING DATES ARE TYPED, WITH ONE EXCEPTION
 *
 * "Schedule next meeting" is the request people edit to enter a real lead, so
 * its date is a plain YYYY-MM-DD rather than a computed one — a meeting has a
 * date somebody agreed to, and a variable there would be a thing to undo
 * before every use.
 *
 * The queue fixture is the exception, and computes a date five days out. That
 * is deliberate: "Upcoming this week" filters to a seven-day window, and both
 * of its shape assertions pass happily against an empty list — so without a
 * row guaranteed inside the window, the request would look green while proving
 * nothing. It now also asserts the window is non-empty, which is what makes the
 * computed fixture necessary rather than merely tidy.
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

/** Admin request — collection-level bearer auth applies. */
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
  ...(exec || before
    ? { event: [...(before ? [prerequest(...before)] : []), ...(exec ? [test(...exec)] : [])] }
    : {}),
  request: {
    ...(token ? { auth: { type: 'bearer', bearer: [{ key: 'token', value: token, type: 'string' }] } } : {}),
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

/** Deck request — no bearer token; the shared key header instead. */
const deckReq = ({ name, path: p, body, description, exec, before }) => ({
  name,
  ...(exec || before
    ? { event: [...(before ? [prerequest(...before)] : []), ...(exec ? [test(...exec)] : [])] }
    : {}),
  request: {
    auth: { type: 'noauth' },
    method: 'POST',
    header: [
      { key: 'Content-Type', value: 'application/json' },
      {
        key: 'X-Knode-Key',
        value: '{{knodeApiKey}}',
        description:
          'Only checked once KNODE_API_KEY is set on the server. Harmless while it is not.',
      },
    ],
    body: { mode: 'raw', raw: JSON.stringify(body, null, 2) },
    url: url(`{{baseUrl}}${p}`),
    description,
  },
  response: [],
});

/* ------------------------------------------------------------- the deck --- */

const CAPTURE_MEETING = deckReq({
  name: 'Deck · Schedule next meeting',
  path: '/knode/leads',
  description:
    'The "Schedule next meeting" button on the deck’s last slide.\n\n' +
    'clientKey is the deck’s own id for the record. It is required rather ' +
    'than optional because it is the only thing standing between a replayed ' +
    'offline queue and a table full of duplicates.\n\n' +
    'savedAt is when the rep pressed save, which on a queued lead is not when ' +
    'this request arrives. The CREATED timeline entry records the gap.\n\n' +
    'THIS IS THE REQUEST TO EDIT FOR A REAL LEAD. Overwrite hospital, person, ' +
    'whatsapp, date, time and notes — the date is a plain YYYY-MM-DD you type, ' +
    'and the time HH:mm on a 24-hour clock. Leave clientKey and savedAt alone: ' +
    'the first is generated so each Send is a new lead, the second is Postman’s ' +
    'own timestamp.',
  before: [
    `// A fresh key each run, so the folder can be replayed. Request 2`,
    `// deliberately reuses it to prove the capture is idempotent.`,
    `pm.collectionVariables.set("knodeClientKey", "deck-" + Date.now());`,
  ],
  body: {
    clientKey: '{{knodeClientKey}}',
    type: 'meeting_scheduled',
    hospital: 'Sunrise Multispeciality, Patna',
    person: 'Dr. Anil Verma',
    designation: 'Owner · Director',
    whatsapp: '+91 98305 44127',
    email: 'anil.verma@sunrisehosp.in',
    // Typed, not computed. This is the request people use to enter a real
    // lead, and a real meeting has a date somebody agreed to — overwrite it.
    date: '2026-09-22',
    time: '11:00',
    notes:
      '120 beds · OPD + Pharmacy + Lab modules discussed · currently on paper registers.',
    savedAt: '{{$isoTimestamp}}',
  },
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `const d = pm.response.json().data;`,
    `pm.test("created", () => pm.expect(d.created).to.be.true);`,
    `pm.test("reference is KND-MTG-YYYY-NNNN", () =>`,
    `  pm.expect(d.referenceNo).to.match(/^KND-MTG-\\d{4}-\\d{4}$/));`,
    `pm.collectionVariables.set("knodeMeetingRef", d.referenceNo);`,
    `console.log("Meeting captured: " + d.referenceNo);`,
  ],
});

const CAPTURE_DUPLICATE = deckReq({
  name: 'Deck · Same lead again (idempotent, no duplicate)',
  path: '/knode/leads',
  description:
    'The deck resending a record it had already queued — the normal case ' +
    'after a dropped connection.\n\n' +
    'It returns 201 with the ORIGINAL reference and `created: false`. Not a ' +
    '409: the rep did nothing wrong, and a client that cannot tell "already ' +
    'sent" from "never arrived" has no useful way to handle a conflict.',
  body: {
    clientKey: '{{knodeClientKey}}',
    type: 'meeting_scheduled',
    hospital: 'Sunrise Multispeciality, Patna',
    person: 'Dr. Anil Verma',
    whatsapp: '+91 98305 44127',
    date: '2026-09-22',
    time: '11:00',
    savedAt: '{{$isoTimestamp}}',
  },
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `const d = pm.response.json().data;`,
    `pm.test("NOT created a second time", () => pm.expect(d.created).to.be.false);`,
    `pm.test("same reference came back", () =>`,
    `  pm.expect(d.referenceNo).to.eql(pm.collectionVariables.get("knodeMeetingRef")));`,
  ],
});

const CAPTURE_CLIENT = deckReq({
  name: 'Deck · Confirm this client',
  path: '/knode/leads',
  description:
    'The second button on the same slide — a hospital that agreed in the ' +
    'room.\n\n' +
    'No date or time: there is no meeting to hold. Sending them anyway is not ' +
    'an error, they are simply dropped, and a database CHECK enforces the same ' +
    'shape for anything that bypasses the API.',
  before: [
    `pm.collectionVariables.set("knodeClientClientKey", "deck-cnf-" + Date.now());`,
  ],
  body: {
    clientKey: '{{knodeClientClientKey}}',
    type: 'client_confirmed',
    hospital: 'Green Valley Hospital, Gaya',
    person: 'Mr. Prakash Ranjan',
    designation: 'Director',
    whatsapp: '+91 98352 70419',
    email: 'director@greenvalleygaya.in',
    notes:
      'Confirmed in the room after the deck · 80 beds · wants go-live before Diwali.',
    savedAt: '{{$isoTimestamp}}',
  },
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `const d = pm.response.json().data;`,
    `pm.test("reference is KND-CNF-YYYY-NNNN", () =>`,
    `  pm.expect(d.referenceNo).to.match(/^KND-CNF-\\d{4}-\\d{4}$/));`,
    `pm.collectionVariables.set("knodeClientRef", d.referenceNo);`,
  ],
});

const CAPTURE_NO_TIME = deckReq({
  name: 'Deck · Meeting with no time (expect 400)',
  path: '/knode/leads',
  description:
    'A meeting nobody can attend is not a meeting. Checked in the service ' +
    'rather than the DTO because it depends on `type`, and again by a CHECK ' +
    'constraint in the database.',
  body: {
    clientKey: 'deck-probe-no-time',
    type: 'meeting_scheduled',
    hospital: 'No Time Hospital',
    person: 'Somebody',
    whatsapp: '+91 90000 00000',
    date: '2026-12-01',
    savedAt: '{{$isoTimestamp}}',
  },
  exec: [
    `pm.test("400", () => pm.response.to.have.status(400));`,
    `pm.test("says which half is missing", () =>`,
    `  pm.expect(pm.response.json().message).to.contain("date and a time"));`,
  ],
});

const SYNC_QUEUE = deckReq({
  name: 'Deck · Flush the offline queue',
  path: '/knode/leads/sync',
  description:
    'What the deck sends when a rep gets signal after a week of visits.\n\n' +
    'Each lead is captured on its own rather than in one transaction, so one ' +
    'bad record cannot reject the rest — and because every capture is ' +
    'idempotent, a partial run is fixed by simply sending the queue again.\n\n' +
    'Capped at 50 leads per call: a returning rep has tens, not thousands, and ' +
    'an unbounded array is a denial-of-service shape.',
  before: [
    `const stamp = Date.now();`,
    `pm.collectionVariables.set("knodeQueueKeyA", "deck-q-a-" + stamp);`,
    `pm.collectionVariables.set("knodeQueueKeyB", "deck-q-b-" + stamp);`,
    ``,
    `// The one computed date in the folder, and it earns its place here: this`,
    `// is a fixture rather than a lead anyone types, and "Upcoming this week"`,
    `// needs a row inside its window or its assertions pass against nothing.`,
    `const d = new Date(Date.now() + 5 * 86400000);`,
    `pm.collectionVariables.set("knodeQueueDate", d.toISOString().slice(0, 10));`,
  ],
  body: {
    leads: [
      {
        clientKey: '{{knodeClientKey}}',
        type: 'meeting_scheduled',
        hospital: 'Sunrise Multispeciality, Patna',
        person: 'Dr. Anil Verma',
        whatsapp: '+91 98305 44127',
        date: '2026-09-22',
        time: '11:00',
        savedAt: '{{$isoTimestamp}}',
      },
      {
        clientKey: '{{knodeQueueKeyA}}',
        type: 'meeting_scheduled',
        hospital: 'Lifeline Hospital, Ranchi',
        person: 'Mr. S. K. Jha',
        designation: 'Admin Head',
        whatsapp: '+91 94311 22876',
        email: 'admin@lifelineranchi.com',
        date: '{{knodeQueueDate}}',
        time: '15:30',
        notes: '60 beds · wants IPD billing walkthrough with accounts present.',
        savedAt: '{{$isoTimestamp}}',
      },
      {
        clientKey: '{{knodeQueueKeyB}}',
        type: 'client_confirmed',
        hospital: 'Sai Krupa Hospital, Pune',
        person: 'Dr. Meenal Kulkarni',
        designation: 'Owner',
        whatsapp: '+91 98220 15563',
        notes: '45 beds · OPD-first rollout · data migration from Excel needed.',
        savedAt: '{{$isoTimestamp}}',
      },
    ],
  },
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `const d = pm.response.json().data;`,
    `pm.test("three received", () => pm.expect(d.received).to.eql(3));`,
    `pm.test("two new", () => pm.expect(d.created).to.eql(2));`,
    `pm.test("the replayed one was recognised", () => pm.expect(d.duplicates).to.eql(1));`,
    `console.log("Synced: " + d.references.join(", "));`,
  ],
});

/* ------------------------------------------------------------ the panel --- */

const STATS = req({
  name: 'Dashboard tiles',
  path: '/admin/knode/leads/stats',
  description:
    'The four tiles on the Knode screen, counted in the database rather than ' +
    'off one page of rows — a count taken from `items.length` is wrong the ' +
    'moment there is a second page.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("all five counts present", () =>`,
    `  ["meetings","meetingsNew","clients","clientsNew","upcomingThisWeek"]`,
    `    .forEach((k) => pm.expect(d).to.have.property(k)));`,
    `console.log(\`Meetings \${d.meetings} (\${d.meetingsNew} new) · Clients \${d.clients} (\${d.clientsNew} new) · Upcoming \${d.upcomingThisWeek}\`);`,
  ],
});

const LIST_MEETINGS = req({
  name: 'Sub-section 01 · Scheduled meetings',
  path: '/admin/knode/leads?type=MEETING_SCHEDULED&page=1&limit=10',
  description:
    'The first tab.\n\n' +
    'Sorted by meeting date ascending, NULLS LAST — tomorrow’s demo ' +
    'matters more than last month’s, and confirmed clients have no date to ' +
    'sort by.\n\n' +
    'The WhatsApp number and the notes are withheld here, for the same reason ' +
    'the contact list withholds a phone number: a list is glanced at, and a ' +
    'personal mobile belongs on the record you deliberately opened.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("only meetings came back", () =>`,
    `  d.items.forEach((i) => pm.expect(i.leadType).to.eql("MEETING_SCHEDULED")));`,
    `pm.test("whatsapp withheld from the list", () =>`,
    `  d.items.forEach((i) => pm.expect(i.whatsapp).to.be.undefined));`,
    `pm.test("notes withheld from the list", () =>`,
    `  d.items.forEach((i) => pm.expect(i.notes).to.be.undefined));`,
    `if (d.items.length) pm.collectionVariables.set("knodeMeetingId", d.items[0].id);`,
  ],
});

const LIST_CLIENTS = req({
  name: 'Sub-section 02 · Confirmed clients',
  path: '/admin/knode/leads?type=CLIENT_CONFIRMED&page=1&limit=10',
  description:
    'The second tab. Hand these to onboarding for paperwork and go-live ' +
    'planning.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("only confirmed clients", () =>`,
    `  d.items.forEach((i) => pm.expect(i.leadType).to.eql("CLIENT_CONFIRMED")));`,
    `pm.test("they carry no meeting date", () =>`,
    `  d.items.forEach((i) => pm.expect(i.meetingDate).to.be.null));`,
    `if (d.items.length) pm.collectionVariables.set("knodeClientId", d.items[0].id);`,
  ],
});

const LIST_UPCOMING = req({
  name: 'Upcoming this week',
  path: '/admin/knode/leads?upcoming=true',
  description:
    'Demos booked between today and seven days out that are still going ' +
    'ahead — DONE and CANCELLED are excluded, because a meeting that ' +
    'already happened is not upcoming.\n\n' +
    'Backed by a partial index on meeting_date, since this runs on every page ' +
    'load of the Knode screen.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `// Asserted rather than assumed: the two checks below pass against an`,
    `// empty list, so without this the request could look green while the`,
    `// filter returned nothing at all. The sync fixture guarantees a row.`,
    `pm.test("the window is not empty", () => pm.expect(d.total).to.be.above(0));`,
    `pm.test("all are meetings", () =>`,
    `  d.items.forEach((i) => pm.expect(i.leadType).to.eql("MEETING_SCHEDULED")));`,
    `pm.test("none already settled", () =>`,
    `  d.items.forEach((i) => pm.expect(["DONE","CANCELLED"]).to.not.include(i.status)));`,
  ],
});

const SEARCH = req({
  name: 'Search by hospital, person or reference',
  path: '/admin/knode/leads?search=Sunrise',
  description:
    'Case-insensitive across hospital name, contact person and reference — ' +
    'the three things somebody would have written down.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `pm.test("found something", () =>`,
    `  pm.expect(pm.response.json().data.total).to.be.above(0));`,
  ],
});

const FIND_ONE = req({
  name: 'One lead in full',
  path: '/admin/knode/leads/{{knodeMeetingId}}',
  description:
    'The detail screen. Unlike the list, this returns the WhatsApp number and ' +
    'the notes the rep wrote in the room — which is the whole reason the ' +
    'list does not.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("whatsapp is returned here", () => pm.expect(d.whatsapp).to.be.a("string"));`,
    `pm.test("savedAt is its own field", () => pm.expect(d.savedAt).to.be.a("string"));`,
    `pm.test("and differs in meaning from createdDate", () =>`,
    `  pm.expect(d).to.have.property("createdDate"));`,
  ],
});

const EVENTS = req({
  name: 'Timeline',
  path: '/admin/knode/leads/{{knodeMeetingId}}/events',
  description:
    'Append-only. The CREATED entry carries how the lead arrived — its ' +
    'metadata has delayMinutes and a `queued` flag, which is the difference ' +
    'between "saved two minutes ago" and "saved on Tuesday and only reached ' +
    'us now".',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("CREATED is on the timeline", () =>`,
    `  pm.expect(d.some((e) => e.eventType === "CREATED")).to.be.true);`,
    `const created = d.find((e) => e.eventType === "CREATED");`,
    `pm.test("it records how the lead arrived", () =>`,
    `  pm.expect(created.metadata).to.have.property("queued"));`,
  ],
});

const STATUS_OK = req({
  name: 'Move a meeting along its own ladder',
  method: 'PATCH',
  path: '/admin/knode/leads/{{knodeMeetingId}}/status',
  body: { status: 'DEMO_DONE', note: 'Walked through OPD and Pharmacy.' },
  description:
    'A scheduled meeting can be: NEW, REMINDER_SENT, DEMO_DONE, RESCHEDULED, ' +
    'DONE, CANCELLED.\n\n' +
    'The note is kept on the timeline entry rather than on the lead — a ' +
    'reason belongs to the change, not to the record.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `pm.test("status moved", () =>`,
    `  pm.expect(pm.response.json().data.status).to.eql("DEMO_DONE"));`,
  ],
});

const STATUS_WRONG_LADDER = req({
  name: 'Meeting marked LIVE — wrong ladder (expect 400)',
  method: 'PATCH',
  path: '/admin/knode/leads/{{knodeMeetingId}}/status',
  body: { status: 'LIVE' },
  description:
    'LIVE belongs to a confirmed client, not a booked demo. The two ladders ' +
    'share only NEW.\n\n' +
    'This matters beyond tidiness: a demo marked LIVE reads on a pipeline ' +
    'report as a closed sale that never happened. Refused by the service and, ' +
    'independently, by a CHECK constraint — so a client that skips the API ' +
    'cannot write it either.',
  exec: [
    `pm.test("400", () => pm.response.to.have.status(400));`,
    `pm.test("names the statuses that ARE allowed", () =>`,
    `  pm.expect(pm.response.json().message).to.contain("REMINDER_SENT"));`,
  ],
});

const ASSIGN = req({
  name: 'Assign a lead',
  method: 'PATCH',
  path: '/admin/knode/leads/{{knodeMeetingId}}/assign',
  body: { assignedTo: '{{salesEmail}}' },
  description:
    'Send `null` to hand it back to the pool. Both directions are recorded on ' +
    'the timeline.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `pm.test("owner set", () =>`,
    `  pm.expect(pm.response.json().data.assignedTo).to.be.a("string"));`,
  ],
});

const ADD_NOTE = req({
  name: 'Add an internal note',
  method: 'POST',
  path: '/admin/knode/leads/{{knodeMeetingId}}/notes',
  body: {
    note: 'Director asked for a pricing comparison against their current desktop software.',
  },
  description:
    'Notes are timeline entries, not a field on the lead — so they are ' +
    'append-only and each one keeps its author and its moment.',
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `pm.test("recorded as NOTE_ADDED", () =>`,
    `  pm.expect(pm.response.json().data.eventType).to.eql("NOTE_ADDED"));`,
  ],
});

/* ---------------------------------------------------------- the refusals --- */

const WRONG_SITE = req({
  name: 'Crane admin reaches for it (expect 403)',
  path: '/admin/knode/leads',
  site: 102,
  token: '{{craneToken}}',
  description:
    'Knode is an IT-unit product, so the scope is hard rather than a filter: ' +
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
  path: '/admin/knode/leads',
  token: '{{viewerToken}}',
  description:
    'KNODE (feature 114) is granted to Super Admin and Sales only.\n\n' +
    'Deliberately not to Viewer, which reads most things: this is commercial ' +
    'pipeline data — what a hospital agreed to, and the mobile number of ' +
    'the person who agreed it.\n\n' +
    'Run the RBAC & Security folder first — it populates viewerToken.',
  exec: [
    `pm.test("403", () => pm.response.to.have.status(403));`,
    `pm.test("names the feature", () =>`,
    `  pm.expect(pm.response.json().message).to.contain("114"));`,
  ],
});

/* ------------------------------------------------------------- assembly --- */

const FOLDER = {
  name: 'Knode Product Deck',
  description:
    'Leads captured on the last slide of the Knode HMS product deck.\n\n' +
    'The one module whose records do not come from a website. The deck is a ' +
    'sales tool carried into hospital meeting rooms, so a lead is typed while ' +
    'sitting with the director — often on poor connectivity — and may ' +
    'reach the server minutes or days later.\n\n' +
    'RUN IN ORDER. The deck requests create the rows the panel requests then ' +
    'read, and the two refusals at the end need craneToken and viewerToken, ' +
    'which the RBAC & Security folder populates.\n\n' +
    'Sign in as Super Admin or Sales on site 101 first — Viewer is refused ' +
    'by design.',
  item: [
    CAPTURE_MEETING,
    CAPTURE_DUPLICATE,
    CAPTURE_CLIENT,
    CAPTURE_NO_TIME,
    SYNC_QUEUE,
    STATS,
    LIST_MEETINGS,
    LIST_CLIENTS,
    LIST_UPCOMING,
    SEARCH,
    FIND_ONE,
    EVENTS,
    STATUS_OK,
    STATUS_WRONG_LADDER,
    ASSIGN,
    ADD_NOTE,
    WRONG_SITE,
    WRONG_ROLE,
  ],
};

const NEW_VARIABLES = [
  ['knodeApiKey', ''],
  ['knodeClientKey', ''],
  ['knodeClientClientKey', ''],
  ['knodeQueueKeyA', ''],
  ['knodeQueueKeyB', ''],
  ['knodeQueueDate', ''],
  ['knodeMeetingRef', ''],
  ['knodeClientRef', ''],
  ['knodeMeetingId', ''],
  ['knodeClientId', ''],
];

const collection = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const changes = [];

// Rewrite in place if present, otherwise sit beside Discovery — the other
// IT-unit module, and the nearest neighbour in the sidebar.
const at = collection.item.findIndex((f) => f.name === FOLDER.name);
if (at === -1) {
  const anchor = collection.item.findIndex((f) => f.name === 'Discovery');
  const insertAt = anchor === -1 ? collection.item.length : anchor + 1;
  collection.item.splice(insertAt, 0, FOLDER);
  changes.push(`added folder    ${FOLDER.name} (${FOLDER.item.length} requests)`);
} else {
  collection.item[at] = FOLDER;
  changes.push(`updated folder  ${FOLDER.name} (${FOLDER.item.length} requests)`);
}

collection.variable = collection.variable ?? [];
for (const [key, value] of NEW_VARIABLES) {
  if (!collection.variable.some((v) => v.key === key)) {
    collection.variable.push({ key, value });
    changes.push(`added variable  ${key}`);
  }
}

fs.writeFileSync(FILE, `${JSON.stringify(collection, null, 2)}\n`);

changes.forEach((c) => console.log(`  ${c}`));
console.log(
  `\n  collection now has ${collection.item.length} folders, ` +
    `${collection.item.reduce((n, f) => n + (f.item?.length ?? 1), 0)} requests`,
);
