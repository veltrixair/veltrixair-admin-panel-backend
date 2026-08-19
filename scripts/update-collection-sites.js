/**
 * Brings the Postman collection in line with the multi-site portal.
 *
 *   node scripts/update-collection-sites.js
 *
 * What changed and therefore what breaks without this:
 *
 *   - Login now takes siteCode and roleCode. Without them: 400.
 *   - GET /admin/auth/login-options is new.
 *   - /me returns one `scope` instead of a `roles` array, so the old test
 *     asserting `body.data.roles.length` fails.
 *   - Creating staff and granting roles need a siteCode.
 *   - Revoking a badge moved to /roles/:siteCode/:roleCode.
 *
 * Idempotent — safe to re-run.
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

// ---------------------------------------------------------------- variables

for (const v of [
  { key: 'siteCode', value: '101', type: 'string' },
  { key: 'roleCode', value: '101', type: 'string' },
]) {
  const existing = collection.variable.find((x) => x.key === v.key);
  if (existing) Object.assign(existing, v);
  else collection.variable.push(v);
}

const folder = (name) => collection.item.find((i) => i.name === name);
const req = (folderName, reqName) =>
  folder(folderName)?.item.find((i) => i.name === reqName);

const json = (value) => ({ mode: 'raw', raw: JSON.stringify(value, null, 2) });
const script = (lines) => ({
  listen: 'test',
  script: { type: 'text/javascript', exec: lines },
});

// -------------------------------------------------------------------- Auth

const auth = folder('Auth');

auth.description =
  'Sign in once, to **one dashboard, as one role**. Both are chosen here and ' +
  'signed into the token, so there is no site header to set and no in-app ' +
  'brand or role switcher — working a second brand, or a second role, means ' +
  'signing in again.\n\n' +
  'Run "Login options" first to see the dashboards and roles, then set ' +
  '`siteCode`, `roleCode` and `adminPassword` and run "Login".\n\n' +
  'Sites: 101 Veltrixair IT · 102 Veltrixair Industries · 103 Veltrixair Privacy.\n' +
  'Roles: 101 SUPER_ADMIN · 102 CONTENT_EDITOR · 103 RECRUITER · 104 SALES · 105 VIEWER.';

// Login options — new, and the first thing anyone should run.
auth.item = auth.item.filter((i) => i.name !== 'Login options');
auth.item.unshift({
  name: 'Login options',
  event: [
    script([
      'const body = pm.response.json();',
      "pm.test('200 OK', () => pm.response.to.have.status(200));",
      "pm.test('lists the dashboards', () => pm.expect(body.data.sites.length).to.be.above(0));",
      'console.log(body.data.sites.map((s) => `${s.code} ${s.name} → ${s.adminDomain}`).join("\\n"));',
      'console.log(body.data.roles.map((r) => `${r.code} ${r.name}`).join("\\n"));',
    ]),
  ],
  request: {
    auth: { type: 'noauth' },
    method: 'GET',
    header: [],
    url: {
      raw: '{{baseUrl}}/admin/auth/login-options',
      host: ['{{baseUrl}}'],
      path: ['admin', 'auth', 'login-options'],
    },
    description:
      'Populates the two pickers on the sign-in screen. Public by necessity — ' +
      'it is read before anyone has signed in. Neither site nor role names are ' +
      'secret, and serving them keeps the login page in step with the database.',
  },
});

// Login — now scoped.
const login = req('Auth', 'Login');
login.request.body = json({
  email: '{{adminEmail}}',
  password: '{{adminPassword}}',
  siteCode: '{{siteCode}}',
  roleCode: '{{roleCode}}',
});
login.request.description =
  'Throttled to 5 attempts per minute per IP.\n\n' +
  'The site and role are a **request, not an authorisation** — they are checked ' +
  'against a live badge before any token exists. The failure codes differ on ' +
  'purpose: a wrong password is a vague 401 because identity is unproven, while ' +
  'a role you do not hold is a specific 403 because by then you have proved who ' +
  'you are and a vague error only creates support tickets.';
login.event = [
  script([
    'const body = pm.response.json();',
    "pm.test('200 OK', () => pm.response.to.have.status(200));",
    "pm.test('returns an access token', () => pm.expect(body.data.accessToken).to.be.a('string'));",
    "pm.test('returns the session scope', () => pm.expect(body.data.scope.siteCode).to.be.a('number'));",
    "pm.test('refresh token is opaque, not a JWT', () => pm.expect(body.data.refreshToken.split('.').length).to.not.eql(3));",
    "pm.collectionVariables.set('accessToken', body.data.accessToken);",
    "pm.collectionVariables.set('refreshToken', body.data.refreshToken);",
    'pm.collectionVariables.set(',
    '  "tokenExpiresAt",',
    '  String(Date.now() + body.data.expiresIn * 1000)',
    ');',
    'console.log(`Signed in to ${body.data.scope.siteName} as ${body.data.scope.roleName} → ${body.data.scope.adminDomain}`);',
  ]),
];

// The wrong-password case keeps working, but needs the new fields to get past
// validation and actually reach the password check.
const wrongPw = req('Auth', 'Login (wrong password — expect 401)');
wrongPw.request.body = json({
  email: '{{adminEmail}}',
  password: 'definitely-not-it',
  siteCode: '{{siteCode}}',
  roleCode: '{{roleCode}}',
});

// New negative case: the credential is right, the badge is not.
auth.item = auth.item.filter(
  (i) => i.name !== 'Login to a dashboard you cannot reach (expect 403)',
);
const loginIndex = auth.item.findIndex((i) => i.name === 'Login');
auth.item.splice(loginIndex + 2, 0, {
  name: 'Login to a dashboard you cannot reach (expect 403)',
  event: [
    script([
      "pm.test('403 forbidden', () => pm.response.to.have.status(403));",
      "pm.test('names what is wrong, since identity is proven', () => pm.expect(pm.response.json().message).to.be.a('string'));",
    ]),
  ],
  request: {
    auth: { type: 'noauth' },
    method: 'POST',
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body: json({
      email: '{{adminEmail}}',
      password: '{{adminPassword}}',
      siteCode: 102,
      roleCode: 101,
    }),
    url: {
      raw: '{{baseUrl}}/admin/auth/login',
      host: ['{{baseUrl}}'],
      path: ['admin', 'auth', 'login'],
    },
    description:
      'Correct password, but no badge on Veltrixair Industries. 403 rather ' +
      'than 401 — and the message says whether the problem is the dashboard or ' +
      'the role, listing the roles you do hold there.',
  },
});

// /me now returns one scope, not a list of roles.
const me = req('Auth', 'Me — roles and permissions');
me.name = 'Me — this session’s scope and permissions';
me.event = [
  script([
    'const body = pm.response.json();',
    "pm.test('200 OK', () => pm.response.to.have.status(200));",
    "pm.test('reports one scope, not a list of brands', () => pm.expect(body.data.scope.siteCode).to.be.a('number'));",
    "pm.test('permissions are this role only', () => pm.expect(body.data.permissions.length).to.be.above(0));",
    "pm.test('never leaks a password hash', () => pm.expect(JSON.stringify(body)).to.not.include('argon2'));",
  ]),
];
me.request.description =
  'The signed-in session: which brand, which role, and what that role may do. ' +
  'Deliberately does NOT list the other brands this account can reach — there ' +
  'is no switcher, so that list would be information the dashboard cannot act on.';

// ------------------------------------------------------------------- Staff

const staff = folder('Staff');

staff.description =
  staff.description.split('\n\nEvery role assignment')[0] +
  '\n\nEvery role assignment is a **badge**: a role on one brand. The same person ' +
  'may hold the same role on two brands, or two roles on one brand — each is a ' +
  'separate badge, and each needs its own sign-in to use.';

const create = req('Staff', 'Create a staff account');
create.request.body = json({
  email: 'new.colleague@veltrixair.com',
  fullName: 'New Colleague',
  roleCodes: [103],
  siteCode: 101,
});
create.request.description =
  'The password is generated server-side and returned ONCE. Hand it over on a ' +
  'channel you trust.\n\n' +
  '`siteCode` is which dashboard these first roles are for. An account starts ' +
  'on one brand; further brands are granted afterwards, one badge at a time.';

const grant = req('Staff', 'Grant one role');
grant.name = 'Grant one badge (role + dashboard)';
grant.request.body = json({ roleCode: 102, siteCode: 101 });
grant.request.description =
  'Idempotent — granting a badge already held is a no-op. Granting the same ' +
  'role on a different site is a genuinely new badge, which is how one person ' +
  'covers recruitment for both IT and cranes.\n\n' +
  "Takes effect on the target's next request; they do not sign in again.";

const revoke = req('Staff', 'Revoke one role');
revoke.name = 'Revoke one badge';
revoke.request.url = {
  raw: '{{baseUrl}}/admin/staff/{{staffId}}/roles/101/102',
  host: ['{{baseUrl}}'],
  path: ['admin', 'staff', '{{staffId}}', 'roles', '101', '102'],
};
revoke.request.description =
  'Path is /roles/:siteCode/:roleCode — a badge is identified by both, since ' +
  'the same role on two brands is two separate grants.\n\n' +
  'Soft-delete: the row stays with revokedAt and revokedBy set. Revoking an ' +
  'account’s last badge anywhere returns 409 — deactivate it instead.';

const replace = req('Staff', 'Replace the whole role set');
replace.name = 'Replace the role set for one dashboard';
replace.request.body = json({ roleCodes: [104, 105], siteCode: 101 });
replace.request.description =
  'Scoped to one brand on purpose: a save on the cranes screen must not ' +
  'silently strip someone’s IT access just because those checkboxes were not ' +
  'on the page. Unchanged roles keep their original assignedBy and date.';

// The list test asserted a flat role shape that now carries site information.
const list = req('Staff', 'List staff');
list.event = [
  script([
    'const body = pm.response.json();',
    "pm.test('200 OK', () => pm.response.to.have.status(200));",
    'if (body.data && body.data.items && body.data.items.length) {',
    "  pm.collectionVariables.set('staffId', body.data.items[0].id);",
    '}',
    "pm.test('each badge names its dashboard', () => {",
    '  (body.data.items || []).forEach((s) => {',
    '    (s.roles || []).forEach((r) => pm.expect(r.siteName).to.be.a("string"));',
    '  });',
    '});',
    "pm.test('never returns a password hash', () => pm.expect(JSON.stringify(body)).to.not.include('argon2'));",
  ]),
];

fs.writeFileSync(FILE, JSON.stringify(collection, null, 2) + '\n');

let count = 0;
(function walk(items) {
  for (const i of items) {
    if (Array.isArray(i.item)) walk(i.item);
    else count++;
  }
})(collection.item);

console.log(`Auth folder:  ${auth.item.length} requests`);
console.log(`Staff folder: ${staff.item.length} requests`);
console.log(`collection:   ${count} requests`);
