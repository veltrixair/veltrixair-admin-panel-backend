/**
 * Brings the Staff folder in line with two-step onboarding.
 *
 *   node scripts/build-postman-staff.js
 *
 * Idempotent: requests are matched by name and rewritten in place, and the
 * new ones are only inserted if absent. Run it again after any change to the
 * staff routes rather than editing the JSON by hand.
 *
 * What changed, and why the collection could not simply be left alone:
 *
 *   - Create no longer returns a password. It creates the account and its
 *     profile, and the account cannot be used until it is invited.
 *   - Invite is the second half, and did not exist before.
 *   - Options is new, and the onboarding form cannot be built without it:
 *     departmentCode is required and nothing else lists the departments.
 *   - Every staff response now carries a derived status and a profile.
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

const test = (...exec) => [
  { listen: 'test', script: { type: 'text/javascript', exec } },
];

const req = ({ name, method = 'GET', path: p, site = 101, body, description, exec }) => ({
  name,
  ...(exec ? { event: test(...exec) } : {}),
  request: {
    method,
    header: [
      { key: 'X-Site-Code', value: String(site) },
      { key: 'Authorization', value: 'Bearer {{accessToken}}' },
      ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : []),
    ],
    ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } } : {}),
    url: url(`{{baseUrl}}${p}`),
    description,
  },
  response: [],
});

// --- the new and rewritten requests --------------------------------------

const OPTIONS = req({
  name: 'Onboarding options (departments, offices)',
  path: '/admin/staff/options',
  description:
    'Every dropdown on the onboarding form.\n\n' +
    'Offices are filtered to the dashboard you signed in to — an IT admin ' +
    'should not be offering someone a desk in a Privacy office. They can come ' +
    'back EMPTY for Industries: office_masters holds nothing for site 102 yet, ' +
    'which is why officeCode is nullable.\n\n' +
    'Departments are NOT site-filtered. Finance is Finance on every brand, and ' +
    'one person may hold badges on several at once.',
  exec: [
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("departments are offered", () => pm.expect(d.departments).to.not.be.empty);`,
    `if (d.departments?.length) pm.collectionVariables.set("departmentCode", d.departments[0].code);`,
    `pm.test("employment types are the four the schema allows", () =>`,
    `  pm.expect(d.employmentTypes).to.have.members(["FULL_TIME","CONTRACT","INTERN","CONSULTANT"]));`,
  ],
});

const CREATE = req({
  name: 'Onboard someone (no password yet)',
  method: 'POST',
  path: '/admin/staff',
  body: {
    email: 'new.colleague@veltrixair.com',
    fullName: 'New Colleague',
    designation: 'Account Manager',
    departmentCode: 103,
    employmentType: 'FULL_TIME',
    mobile: '+966 55 000 0000',
    officeCode: 101,
    joiningDate: '2026-09-01',
    probationUntil: '2026-12-01',
    notes: 'Referred by the Riyadh team.',
  },
  description:
    'Creates the account AND its profile, in one transaction, and nothing else.\n\n' +
    'NO PASSWORD IS RETURNED — the account exists and cannot be signed in to. ' +
    'POST :id/invite is the second half. That split is the point: filing a ' +
    'colleague and letting them in are different decisions, usually taken on ' +
    'different days by different people.\n\n' +
    'roleCodes is OPTIONAL. Omit it and they get PENDING (106) — a badge that ' +
    'grants nothing, so they can sign in to an empty dashboard while their ' +
    'real role is decided. VIEWER would have been the convenient default and ' +
    'the wrong one: it reads contact enquiries, crane quotes and privacy ' +
    'enquiries, handing over every customer name and phone number before ' +
    'anyone has said what this person does.\n\n' +
    'Still no siteCode. The account lands on the dashboard your token says ' +
    'you are on; naming another is a 400, not a refusal.',
  exec: [
    `pm.test("201 created", () => pm.response.to.have.status(201));`,
    `const d = pm.response.json().data;`,
    `if (d?.id) pm.collectionVariables.set("staffId", d.id);`,
    `pm.test("no password — not usable yet", () => pm.expect(d.temporaryPassword).to.be.undefined);`,
    `pm.test("status is PENDING", () => pm.expect(d.status).to.eql("PENDING"));`,
    `pm.test("default badge is PENDING on your site", () =>`,
    `  pm.expect(d.roles.map(r => r.code)).to.eql([106]));`,
    `pm.test("an employee code was issued", () =>`,
    `  pm.expect(d.profile.employeeCode).to.match(/^VTX-EMP-\\d{4}$/));`,
    `pm.test("the mobile is withheld from the response", () =>`,
    `  pm.expect(d.profile.mobile).to.be.undefined);`,
  ],
});

const INVITE = req({
  name: 'Invite by id (Resend from the staff list)',
  method: 'POST',
  path: '/admin/staff/{{staffId}}/invite',
  body: {
    email: 'new.colleague@veltrixair.com',
    roleCodes: [104],
    resend: true,
  },
  description:
    'Mints the temporary password, stamps invited_at, sets mustChangePassword, ' +
    'and emails it.\n\n' +
    'The password is ALSO in the response, and that is not belt-and-braces: ' +
    'the mail transport only writes a log line today, so this is the only way ' +
    'the credential reaches anyone. Once mail works it should be removed and ' +
    'this should send a link rather than a credential.\n\n' +
    'Inviting twice is a 409. Send resend: true to override — a re-invite ' +
    'invalidates the old password and ends every session, so it is a decision ' +
    'rather than a double-clicked button.\n\n' +
    'roleCodes decides what they start with, and this is the natural moment ' +
    'for it: PENDING exists to hold a place while somebody decides, and ' +
    'deciding is exactly what inviting someone involves. Naming a real role ' +
    'also REVOKES the PENDING badge, so nobody is left picking between a ' +
    'placeholder and a real role at the sign-in screen. Omit it and they stay ' +
    'PENDING.\n\n' +
    'email is optional and corrects a typo before anyone has ever used the ' +
    'account. Accepted only while uninvited — afterwards the address is the ' +
    'person’s identity, and changing it is refused here.',
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `const d = pm.response.json().data;`,
    `if (d?.temporaryPassword) pm.collectionVariables.set("staffTempPassword", d.temporaryPassword);`,
    `if (d?.email) pm.collectionVariables.set("staffEmail", d.email);`,
    `pm.test("status becomes INVITED", () => pm.expect(d.status).to.eql("INVITED"));`,
    `pm.test("and they are prompted to choose their own", () =>`,
    `  pm.expect(d.mustChangePassword).to.be.true);`,
    `pm.test("the named role was granted", () =>`,
    `  pm.expect(d.roles.map(r => r.code)).to.include(104));`,
    `pm.test("and the PENDING placeholder was revoked with it", () =>`,
    `  pm.expect(d.roles.map(r => r.code)).to.not.include(106));`,
  ],
});

const INVITE_AGAIN = req({
  name: 'Invite again without resend (expect 409)',
  method: 'POST',
  path: '/admin/staff/{{staffId}}/invite',
  body: { email: 'new.colleague@veltrixair.com', roleCodes: [104] },
  description:
    'Guards a password somebody may be halfway through typing. ' +
    'Send { "resend": true } when you actually mean it.',
  exec: [`pm.test("409", () => pm.response.to.have.status(409));`],
});

const INVITE_BY_EMAIL = req({
  name: 'Invite a member (by email — the panel)',
  method: 'POST',
  path: '/admin/staff/invite',
  body: {
    email: 'new.colleague@veltrixair.com',
    roleCodes: [104],
    message: 'Welcome aboard — this gets you into the admin panel.',
  },
  description:
    'What the "Invite a member" panel sends: an address and a role, no id.\n\n' +
    'It FINDS an account that already exists and does not create one. A ' +
    'two-field panel cannot supply a designation, a department or an ' +
    'employment type, so letting it create would open a second onboarding ' +
    'path whose accounts silently have no profile. File the person on the ' +
    'staff form first; this decides their role and lets them in.\n\n' +
    'An unknown address and an address on another dashboard both give the ' +
    'same 404. Distinguishing them would make this a way to test whether a ' +
    'colleague exists on a brand you cannot see.\n\n' +
    'Its sibling POST :id/invite is for the staff list’s Resend action, where ' +
    'the id is already in hand.',
  exec: [
    `pm.test("201", () => pm.response.to.have.status(201));`,
    `const d = pm.response.json().data;`,
    `if (d?.temporaryPassword) pm.collectionVariables.set("staffTempPassword", d.temporaryPassword);`,
    `pm.test("status becomes INVITED", () => pm.expect(d.status).to.eql("INVITED"));`,
    `pm.test("the named role was granted", () =>`,
    `  pm.expect(d.roles.map(r => r.code)).to.include(104));`,
    `pm.test("and the PENDING placeholder went with it", () =>`,
    `  pm.expect(d.roles.map(r => r.code)).to.not.include(106));`,
  ],
});

const INVITE_UNKNOWN = req({
  name: 'Invite an address with no account (expect 404)',
  method: 'POST',
  path: '/admin/staff/invite',
  body: { email: 'nobody-at-all@veltrixair.com', roleCodes: [104] },
  description:
    'The panel never creates. Someone has to exist on this dashboard first, ' +
    'which is what keeps every account coming through the staff form with a ' +
    'profile attached.',
  exec: [`pm.test("404", () => pm.response.to.have.status(404));`],
});

const INVITE_BLANK = req({
  name: 'Invite with a blank body (expect 400)',
  method: 'POST',
  path: '/admin/staff/{{staffId}}/invite',
  body: {},
  description:
    'Both fields are required now.\n\n' +
    'email, because this is the moment a credential leaves the building and ' +
    'whoever sends it should have to look at the destination and type it.\n\n' +
    'roleCodes, because this endpoint is the only one that issues a password ' +
    '— so insisting on a real role here is what guarantees a working ' +
    'credential never exists on an account whose job nobody has decided.',
  exec: [`pm.test("400", () => pm.response.to.have.status(400));`],
});

const INVITE_PENDING = req({
  name: 'Invite into PENDING (expect 400)',
  method: 'POST',
  path: '/admin/staff/{{staffId}}/invite',
  body: { email: 'new.colleague@veltrixair.com', roleCodes: [106] },
  description:
    'PENDING is a placeholder for someone nobody has committed to yet, and ' +
    'handing that account a password is the exact state this rule exists to ' +
    'prevent.\n\n' +
    'To leave someone on PENDING, do not invite them. The placeholder keeps ' +
    'the account visible on your staff list until you do.',
  exec: [
    `pm.test("400", () => pm.response.to.have.status(400));`,
    `pm.test("and says why", () => pm.expect(pm.response.json().message).to.match(/placeholder/i));`,
  ],
});

const SIGN_IN_AS_NEW = {
  name: 'Sign in as the new colleague',
  event: test(
    `pm.test("the temporary password works", () => pm.response.to.have.status(200));`,
    `if (pm.response.code === 200) pm.collectionVariables.set("pendingToken", pm.response.json().data.accessToken);`,
  ),
  request: {
    method: 'POST',
    header: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'X-Site-Code', value: '101' },
    ],
    body: {
      mode: 'raw',
      raw: JSON.stringify(
        {
          email: 'new.colleague@veltrixair.com',
          password: '{{staffTempPassword}}',
          siteCode: 101,
          roleCode: 104,
        },
        null,
        2,
      ),
    },
    url: url('{{baseUrl}}/admin/auth/login'),
    description:
      'roleCode 104 is SALES — granted by the invitation above, which also ' +
      'revoked the PENDING placeholder.\n\n' +
      'Had the invitation omitted roleCodes, this would be 106 (PENDING). ' +
      'That role appears in /admin/auth/login-options despite granting ' +
      'nothing, and has to: otherwise someone newly invited would have no ' +
      'role to select on the screen they were just sent to.',
  },
  response: [],
};

const PENDING_ME = {
  name: 'What the new colleague sees (/me)',
  event: test(
    `pm.test("they land on their dashboard", () => pm.response.to.have.status(200));`,
    `const d = pm.response.json().data;`,
    `pm.test("prompted to choose their own password", () => pm.expect(d.mustChangePassword).to.be.true);`,
    `pm.test("they arrive holding SALES, not a placeholder", () =>`,
    `  pm.expect(d.scope.roleName).to.eql("SALES"));`,
    `pm.test("and can already see what SALES grants", () =>`,
    `  pm.expect(d.permissions.map(p => p.feature)).to.include("IT_CONTACT"));`,
    `pm.test("their own profile is here, mobile included", () =>`,
    `  pm.expect(d.profile.employeeCode).to.match(/^VTX-EMP-/));`,
  ),
  request: {
    method: 'GET',
    header: [
      { key: 'X-Site-Code', value: '101' },
      { key: 'Authorization', value: 'Bearer {{pendingToken}}' },
    ],
    url: url('{{baseUrl}}/admin/auth/me'),
    description:
      'They get IN — the prompt is advisory, not a lock. An earlier build ' +
      'blocked every route until the password was changed; it bought nothing, ' +
      'because PENDING is refused everywhere anyway, and it made the dashboard ' +
      'unreachable for someone who had just been told to go and use it.\n\n' +
      '/me now also carries their OWN profile. It had to: /admin/staff/:id ' +
      'needs the ADMINS feature, so without this nobody could see their own ' +
      'designation or employee code unless they were also allowed to ' +
      'administer everyone else.',
  },
  response: [],
};

const PENDING_BLOCKED = {
  name: 'They see only what SALES grants (expect 403)',
  event: test(
    `pm.test("403 — careers is not theirs", () => pm.response.to.have.status(403));`,
  ),
  request: {
    method: 'GET',
    header: [
      { key: 'X-Site-Code', value: '101' },
      { key: 'Authorization', value: 'Bearer {{pendingToken}}' },
    ],
    url: url('{{baseUrl}}/admin/careers/jobs'),
    description:
      'SALES holds no careers feature, so this is refused while ' +
      '/admin/contact/enquiries is not.\n\n' +
      'Worth trying /admin/crane-quotes with this same token too: SALES DOES ' +
      'grant CRANE_QUOTES, but their badge is on site 101 and that controller ' +
      'is hard-scoped to Industries — so the role says yes and the site says ' +
      'no. That is why a permission list alone must never drive the sidebar.',
  },
  response: [],
};

// --- site-wise staff lists ------------------------------------------------

/**
 * The same route as a different persona.
 *
 * Uses the persona tokens captured by the RBAC folder rather than
 * {{accessToken}}, because the whole point is to show three sessions getting
 * three different answers from one URL.
 */
const siteList = (name, site, token, description) => ({
  name,
  event: test(
    `pm.test("200", () => pm.response.to.have.status(200));`,
    `const items = pm.response.json().data.items;`,
    `pm.test("everyone listed holds a badge on site ${site}", () => {`,
    `  const foreign = items.filter((s) => !s.roles.some((r) => r.siteCode === ${site}));`,
    `  pm.expect(foreign.map((s) => s.email)).to.be.empty;`,
    `});`,
    `pm.test("each row carries its status and profile", () => {`,
    `  items.forEach((s) => {`,
    `    pm.expect(s.status).to.be.oneOf(["PENDING", "INVITED", "ACTIVE", "DISABLED"]);`,
    `    pm.expect(s).to.have.property("profile");`,
    `  });`,
    `});`,
  ),
  request: {
    method: 'GET',
    header: [
      { key: 'X-Site-Code', value: String(site) },
      { key: 'Authorization', value: `Bearer {{${token}}}` },
    ],
    url: url('{{baseUrl}}/admin/staff?page=1&limit=25'),
    description,
  },
  response: [],
});

const SITE_LISTS = {
  name: 'Site-wise staff lists',
  description:
    'The same route, three sessions, three different answers.\n\n' +
    'There is no site parameter and there never can be: the list is bound to ' +
    'the dashboard your token was signed for. An admin on one brand cannot ' +
    'enumerate colleagues on another, and cannot ask to.\n\n' +
    'Note who appears on ALL THREE: admin@veltrixair.com holds a badge on ' +
    'each, so it is genuinely a colleague on each. That is why site is ' +
    'recorded on the badge in admin_roles and NOT on the profile — a profile ' +
    'column would have to pick one brand and be wrong about the other two.\n\n' +
    'Requires the tokens from RBAC & Security → 00 · Sign in as everyone.',
  item: [
    siteList(
      'As the IT admin → site 101 only',
      101,
      'itToken',
      'Everyone holding a live badge on Veltrixair IT.',
    ),
    siteList(
      'As the crane admin → site 102 only',
      102,
      'craneToken',
      'Everyone on Veltrixair Industries. Far shorter — most colleagues have ' +
        'no badge here at all, so they do not exist to this session.',
    ),
    siteList(
      'As the privacy admin → site 103 only',
      103,
      'privacyToken',
      'Everyone on the Privacy practice.',
    ),
  ].filter(Boolean),
};

// --- rewrite --------------------------------------------------------------

const collection = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const staff = collection.item.find((i) => i.name === 'Staff');
if (!staff) throw new Error('Staff folder not found');

const changes = [];

const replaceByName = (name, next) => {
  const at = staff.item.findIndex((r) => r.name === name);
  if (at === -1) return false;
  staff.item[at] = next;
  changes.push(`rewrote  ${name} → ${next.name}`);
  return true;
};

/**
 * Insert, or overwrite in place if the name is already there.
 *
 * The earlier version skipped anything that already existed, which made this
 * script silently useless for its main job: it left a stale invite body in the
 * collection after the endpoint's contract changed, so the saved request would
 * have 400'd. Re-running a generator must converge on what the generator says,
 * not on whatever happened to be there first.
 */
const insertAfter = (name, ...items) => {
  const fresh = [];
  for (const item of items) {
    const at = staff.item.findIndex((r) => r.name === item.name);
    if (at === -1) {
      fresh.push(item);
      changes.push(`added    ${item.name}`);
    } else {
      staff.item[at] = item;
      changes.push(`updated  ${item.name}`);
    }
  }
  const anchor = staff.item.findIndex((r) => r.name === name);
  const start = anchor === -1 ? staff.item.length : anchor + 1;
  staff.item.splice(start, 0, ...fresh);
};

replaceByName('Create a staff account', CREATE);
insertAfter('List roles and what they grant', OPTIONS);
insertAfter(
  CREATE.name,
  INVITE_BLANK,
  INVITE_PENDING,
  INVITE_UNKNOWN,
  INVITE_BY_EMAIL,
  INVITE,
  INVITE_AGAIN,
  SIGN_IN_AS_NEW,
  PENDING_ME,
  PENDING_BLOCKED,
);

// The two existing requests whose responses changed shape.
const listStaff = staff.item.find((r) => r.name === 'List staff');
if (listStaff) {
  listStaff.request.description =
    'Bound to the dashboard your token was signed for — there is no site ' +
    'parameter, and cannot be.\n\n' +
    'Each row now carries a derived status (PENDING / INVITED / ACTIVE / ' +
    'DISABLED) worked out from is_active, invited_at and last_login_at, plus ' +
    'the profile. The mobile is withheld here and returned only by /me, to ' +
    'its owner.\n\n' +
    'Filters: search (name or email), roleCode, isActive.';
  changes.push('rewrote  List staff (description)');
}

const getOne = staff.item.find((r) => r.name === 'Get one staff member');
if (getOne) {
  getOne.request.description =
    'Returns roles and the onboarding profile. 404 — not 403 — for anyone ' +
    'holding no badge on your dashboard: from where you stand, that account ' +
    'genuinely does not exist, and a 403 would turn this route into a ' +
    'directory of every colleague in the company.';
  changes.push('rewrote  Get one staff member (description)');
}

const patch = staff.item.find((r) => r.name === 'Rename / deactivate');
if (patch) {
  patch.request.body = {
    mode: 'raw',
    raw: JSON.stringify(
      {
        fullName: 'New Colleague',
        designation: 'Senior Account Manager',
        departmentCode: 103,
        mobile: '+966 55 111 2222',
      },
      null,
      2,
    ),
  };
  patch.request.description =
    'Now edits the profile as well as the account. Only the keys you send are ' +
    'written, so changing a designation cannot blank a mobile number that was ' +
    'simply not on the form.\n\n' +
    'employeeCode is deliberately not editable — it identifies the person in ' +
    'records this system does not own.\n\n' +
    'Send isActive: false to deactivate, which ends every session on every ' +
    'brand and is refused unless the account is wholly within your dashboard.';
  changes.push('rewrote  Rename / deactivate');
}

if (!collection.item.some((i) => i.name === SITE_LISTS.name)) {
  const staffAt = collection.item.findIndex((i) => i.name === 'Staff');
  collection.item.splice(staffAt + 1, 0, SITE_LISTS);
  changes.push(`added    ${SITE_LISTS.name} (${SITE_LISTS.item.length} requests)`);
}

const vars = {
  departmentCode: '103',
  staffTempPassword: '',
  pendingToken: '',
};
collection.variable = collection.variable ?? [];
const have = new Set(collection.variable.map((v) => v.key));
for (const [key, value] of Object.entries(vars)) {
  if (!have.has(key)) {
    collection.variable.push({ key, value, type: 'string' });
    changes.push(`variable ${key}`);
  }
}

fs.writeFileSync(FILE, `${JSON.stringify(collection, null, 2)}\n`);

let total = 0;
const count = (items) => items.forEach((i) => (i.item ? count(i.item) : total++));
count(collection.item);

changes.forEach((c) => console.log(`  ${c}`));
console.log(`\nStaff folder: ${staff.item.length} requests`);
console.log(`Collection:   ${total} requests`);
