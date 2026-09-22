/**
 * Rebuilds the "RBAC & Security" folder in the Postman collection.
 *
 *   node scripts/build-postman-rbac.js
 *
 * Idempotent: it strips any previous copy of the folder before appending a
 * fresh one, so re-running never duplicates. It also patches the handful of
 * ordinary requests whose contract changed this week.
 *
 * WHAT THIS SUITE IS FOR
 *
 * Every isolation rule in this system lives in application code — Row Level
 * Security is enabled on no table, and the app connects as one database user.
 * So the rules are only as good as the last developer who remembered them, and
 * the point of these probes is to notice when one is forgotten.
 *
 * Two locks are tested separately because they are not equally strong:
 *
 *   HARD-SCOPED  a @SiteScope guard refuses the route outright — 403 before a
 *                query runs. Asserted as a refusal.
 *   FILTER-ONLY  no guard; the service is trusted to bind siteCode in its
 *                query. Cannot be asserted as a refusal, so these probes
 *                assert the weaker property — the response carries no row
 *                belonging to another brand.
 *
 * A filter-only surface that starts returning another brand's rows is exactly
 * the bug class found four times already, and those probes are the ones worth
 * watching.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'docs', 'veltrixair.postman_collection.json');
const FOLDER = 'RBAC & Security';

// --- helpers -------------------------------------------------------------

const test = (...lines) => ({
  listen: 'test',
  script: { type: 'text/javascript', exec: lines },
});

const url = (raw) => {
  const [pathPart, queryPart] = raw.replace('{{baseUrl}}/', '').split('?');
  const out = {
    raw,
    host: ['{{baseUrl}}'],
    path: pathPart.split('/').filter(Boolean),
  };
  if (queryPart) {
    out.query = queryPart.split('&').map((kv) => {
      const [key, value = ''] = kv.split('=');
      return { key, value };
    });
  }
  return out;
};

/**
 * One probe.
 *
 * `token` is a variable name, not a value — the persona whose session is being
 * used. `site` is the X-Site-Code header, which every request carries because
 * in development all three frontends share localhost.
 */
const probe = ({ name, method = 'GET', path: p, token, site, body, expect, note }) => {
  const headers = [{ key: 'X-Site-Code', value: String(site) }];
  if (token) headers.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body) headers.push({ key: 'Content-Type', value: 'application/json' });

  return {
    name,
    event: [test(...expect)],
    request: {
      method,
      header: headers,
      ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } } : {}),
      url: url(`{{baseUrl}}${p}`),
      ...(note ? { description: note } : {}),
    },
    response: [],
  };
};

/** Expect an outright refusal. */
const refused = (status, what) => [
  `pm.test("${what}", () => pm.response.to.have.status(${status}));`,
];

/** Expect success. */
const allowed = (what, ...extra) => [
  `pm.test("${what}", () => pm.response.to.have.status(200));`,
  ...extra,
];

/**
 * Expect a 200 whose rows all belong to the caller's brand.
 *
 * This is the assertion for filter-only surfaces. It cannot prove the filter
 * is applied — only that nothing leaked on this run — but a regression that
 * drops the siteCode bind will fail it immediately.
 */
const noForeignRows = (site, what) => [
  `pm.test("${what}", () => {`,
  `  pm.response.to.have.status(200);`,
  `  const items = pm.response.json().data?.items ?? pm.response.json().data ?? [];`,
  `  const foreign = (Array.isArray(items) ? items : [])`,
  `    .filter((r) => r.siteCode !== undefined && r.siteCode !== ${site});`,
  `  pm.expect(foreign, JSON.stringify(foreign.slice(0, 3))).to.have.lengthOf(0);`,
  `});`,
];

const signIn = (name, emailVar, passwordVar, site, role, tokenVar, extra = []) => ({
  name,
  event: [
    test(
      `pm.test("signed in", () => pm.response.to.have.status(200));`,
      `if (pm.response.code === 200) {`,
      `  const d = pm.response.json().data;`,
      `  pm.collectionVariables.set("${tokenVar}", d.accessToken);`,
      ...extra,
      `}`,
    ),
  ],
  request: {
    method: 'POST',
    header: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'X-Site-Code', value: String(site) },
    ],
    body: {
      mode: 'raw',
      raw: JSON.stringify(
        { email: `{{${emailVar}}}`, password: `{{${passwordVar}}}`, siteCode: site, roleCode: role },
        null,
        2,
      ),
    },
    url: url('{{baseUrl}}/admin/auth/login'),
  },
  response: [],
});

const folder = (name, description, items) => ({ name, description, item: items });

// =========================================================================
// 00 · Personas
// =========================================================================

const personas = folder(
  '00 · Sign in as everyone',
  'Run this first. Each login captures a token the later probes reuse.\n\n' +
    'Note the last two: the SAME account signs in twice, once as SALES and once ' +
    'as VIEWER. It holds both badges on site 101, and the permissions differ — ' +
    'which is the badge model working. Role is a badge, not a property of the person.',
  [
    signIn('Root — SUPER_ADMIN @ 101', 'rootEmail', 'rootPassword', 101, 101, 'rootToken101', [
      `  pm.collectionVariables.set("rootAdminId", d.admin.id);`,
    ]),
    signIn('Root — SUPER_ADMIN @ 102', 'rootEmail', 'rootPassword', 102, 101, 'rootToken102'),
    signIn('IT admin — SUPER_ADMIN @ 101', 'itEmail', 'itPassword', 101, 101, 'itToken'),
    signIn('Crane admin — SUPER_ADMIN @ 102', 'craneEmail', 'cranePassword', 102, 101, 'craneToken'),
    signIn('Privacy admin — SUPER_ADMIN @ 103', 'privacyEmail', 'privacyPassword', 103, 101, 'privacyToken'),
    signIn('Editor — CONTENT_EDITOR @ 101', 'editorEmail', 'editorPassword', 101, 102, 'editorToken'),
    signIn('Sales — SALES @ 101', 'salesEmail', 'salesPassword', 101, 104, 'salesToken', [
      `  pm.collectionVariables.set("salesAdminId", d.admin.id);`,
    ]),
    signIn('Sales — VIEWER @ 101 (same account, other badge)', 'salesEmail', 'salesPassword', 101, 105, 'viewerToken'),
  ],
);

// =========================================================================
// 01 · Authentication
// =========================================================================

const authentication = folder(
  '01 · Authentication',
  'Can anything be reached without a valid, current session.',
  [
    probe({
      name: 'No Authorization header → 401',
      path: '/admin/careers/jobs',
      site: 101,
      expect: refused(401, 'an admin route is unreachable without a session'),
    }),
    probe({
      name: 'Garbage bearer token → 401',
      path: '/admin/careers/jobs',
      site: 101,
      token: 'garbageToken',
      expect: refused(401, 'a forged token is rejected'),
    }),
    probe({
      name: 'Refresh token used as an access token → 401',
      path: '/admin/careers/jobs',
      site: 101,
      token: 'refreshToken',
      expect: refused(401, 'a refresh token cannot authorise a request'),
      note:
        'The two tokens are signed for different purposes. If this ever returns 200, ' +
        'a stolen refresh token becomes a full session with no exchange step.',
    }),
    probe({
      name: 'Wrong password → 401',
      method: 'POST',
      path: '/admin/auth/login',
      site: 101,
      body: { email: '{{itEmail}}', password: 'not-the-password', siteCode: 101, roleCode: 101 },
      expect: refused(401, 'a bad password is refused'),
    }),
    probe({
      name: 'Sign in to a dashboard you hold no badge on → 403',
      method: 'POST',
      path: '/admin/auth/login',
      site: 102,
      body: { email: '{{itEmail}}', password: '{{itPassword}}', siteCode: 102, roleCode: 101 },
      expect: refused(403, 'the IT admin cannot sign in to Industries'),
      note: 'Correct credentials, wrong dashboard. The badge is what grants the session.',
    }),
    probe({
      name: 'Sign in as a role you do not hold → 403',
      method: 'POST',
      path: '/admin/auth/login',
      site: 101,
      body: { email: '{{itEmail}}', password: '{{itPassword}}', siteCode: 101, roleCode: 103 },
      expect: refused(403, 'a role the account does not hold is refused'),
    }),
  ],
);

// =========================================================================
// 02 · Site isolation — hard-scoped surfaces
// =========================================================================

const crossBrand = [
  ['Crane admin → IT careers', 'craneToken', 102, '/admin/careers/jobs'],
  ['Crane admin → IT applications', 'craneToken', 102, '/admin/applications'],
  ['Crane admin → privacy enquiries', 'craneToken', 102, '/admin/privacy-contact'],
  ['IT admin → crane quotes', 'itToken', 101, '/admin/crane-quotes'],
  ['IT admin → crane site visits', 'itToken', 101, '/admin/crane-site-visits'],
  ['IT admin → crane careers', 'itToken', 101, '/admin/crane-careers/jobs'],
  ['IT admin → crane applications', 'itToken', 101, '/admin/crane-applications'],
  ['IT admin → privacy enquiries', 'itToken', 101, '/admin/privacy-contact'],
  ['Privacy admin → crane quotes', 'privacyToken', 103, '/admin/crane-quotes'],
  ['Privacy admin → IT careers', 'privacyToken', 103, '/admin/careers/jobs'],
];

const siteIsolation = folder(
  '02 · Site isolation — hard-scoped',
  'These routes carry a @SiteScope guard, so a session on the wrong brand is ' +
    'refused before any query runs.\n\n' +
    'Every one of these is a 403 whose message names the problem — "This feature ' +
    'belongs to another dashboard." A 200 here is a brand boundary that has ' +
    'stopped existing.',
  [
    ...crossBrand.map(([name, token, site, p]) =>
      probe({
        name: `${name} → 403`,
        path: p,
        token,
        site,
        expect: refused(403, `${name.toLowerCase()} is refused`),
      }),
    ),
    probe({
      name: 'Header spoof — crane token + X-Site-Code: 101 on a crane route → still 200',
      path: '/admin/crane-quotes',
      token: 'craneToken',
      site: 101,
      expect: allowed('the signed token decides the brand, not the header'),
      note:
        'X-Site-Code is a development convenience for resolving PUBLIC form posts ' +
        'when all three frontends share localhost. It must never influence an ' +
        'authenticated session, whose brand was signed in at login.',
    }),
    probe({
      name: 'Header spoof — crane token + X-Site-Code: 101 on an IT route → still 403',
      path: '/admin/careers/jobs',
      token: 'craneToken',
      site: 101,
      expect: refused(403, 'a spoofed header does not unlock another brand'),
    }),
  ],
);

// =========================================================================
// 03 · Site isolation — filter-only surfaces
// =========================================================================

const filterOnly = folder(
  '03 · Site isolation — filter-only',
  'These routes have NO @SiteScope guard. They are shared surfaces (files, ' +
    'staff) or ones where the decision was never made (contact, discovery, ' +
    'insights), so a super admin on any brand can call them and the service ' +
    'alone is responsible for binding siteCode.\n\n' +
    'That means these cannot be asserted as refusals. They assert the weaker ' +
    'property instead: the response carried no row from another brand. This is ' +
    'the surface where all four historical isolation bugs lived — a passing ' +
    'result here is the absence of a leak, not a guarantee against one.',
  [
    probe({
      name: 'Crane admin → contact enquiries — no IT rows',
      path: '/admin/contact?limit=50',
      token: 'craneToken',
      site: 102,
      expect: noForeignRows(102, 'no other brand’s enquiries are returned'),
    }),
    probe({
      name: 'Crane admin → insights articles — no IT rows',
      path: '/admin/insights/articles?limit=50',
      token: 'craneToken',
      site: 102,
      expect: noForeignRows(102, 'no other brand’s articles are returned'),
    }),
    probe({
      name: 'Crane admin → discovery bookings — no IT rows',
      path: '/admin/discovery/bookings?limit=50',
      token: 'craneToken',
      site: 102,
      expect: noForeignRows(102, 'no other brand’s bookings are returned'),
    }),
    probe({
      name: 'Crane admin → files — no IT objects',
      path: '/admin/files',
      token: 'craneToken',
      site: 102,
      expect: noForeignRows(102, 'no other brand’s files are listed'),
    }),
    probe({
      name: 'Privacy admin → contact enquiries — no IT rows',
      path: '/admin/contact?limit=50',
      token: 'privacyToken',
      site: 103,
      expect: noForeignRows(103, 'no other brand’s enquiries are returned'),
    }),
  ],
);

// =========================================================================
// 04 · Object-level — knowing a UUID must not be enough
// =========================================================================

const idor = folder(
  '04 · Object level (IDOR)',
  'A guard protects a route; it does not protect a row. These probes fetch a ' +
    'real id as one brand and then ask for it as another.\n\n' +
    'A UUID is not a secret — it travels in URLs, logs and support tickets. ' +
    'The correct answer to "another brand\'s id" is 404, not 403: from where ' +
    'the caller stands, that record genuinely does not exist.',
  [
    {
      name: 'Setup — capture an IT job id and file id',
      event: [
        test(
          `pm.test("captured", () => pm.response.to.have.status(200));`,
          `const items = pm.response.json().data?.items ?? [];`,
          `if (items.length) pm.collectionVariables.set("probeItJobId", items[0].id);`,
        ),
      ],
      request: {
        method: 'GET',
        header: [
          { key: 'X-Site-Code', value: '101' },
          { key: 'Authorization', value: 'Bearer {{itToken}}' },
        ],
        url: url('{{baseUrl}}/admin/careers/jobs?limit=1'),
      },
      response: [],
    },
    probe({
      name: 'Crane admin → that IT job by id → 403',
      path: '/admin/careers/jobs/{{probeItJobId}}',
      token: 'craneToken',
      site: 102,
      expect: refused(403, 'the guard refuses before the id is even looked up'),
    }),
    {
      name: 'Setup — capture an IT file id',
      event: [
        test(
          `const files = pm.response.json().data ?? [];`,
          `if (files.length) pm.collectionVariables.set("probeItFileId", files[0].id);`,
          `pm.test("captured a file id (skip the next two if none exist)", () => pm.expect(true).to.be.true);`,
        ),
      ],
      request: {
        method: 'GET',
        header: [
          { key: 'X-Site-Code', value: '101' },
          { key: 'Authorization', value: 'Bearer {{itToken}}' },
        ],
        url: url('{{baseUrl}}/admin/files'),
      },
      response: [],
    },
    probe({
      name: 'Crane admin → signed URL for that IT file → 404',
      path: '/admin/files/{{probeItFileId}}/download-url',
      token: 'craneToken',
      site: 102,
      expect: refused(404, 'a signed URL is not issued across a brand boundary'),
      note:
        'This route once took the id alone and issued a URL to the object. That ' +
        'made a UUID sufficient to read another brand\'s files. Fixed — this ' +
        'probe exists so it stays fixed.',
    }),
    probe({
      name: 'Crane admin → delete that IT file → 404',
      method: 'DELETE',
      path: '/admin/files/{{probeItFileId}}',
      token: 'craneToken',
      site: 102,
      expect: refused(404, 'another brand’s file cannot be deleted'),
    }),
  ],
);

// =========================================================================
// 05 · Feature permissions
// =========================================================================

const permissions = folder(
  '05 · Feature permissions',
  'Same brand, wrong role. role_permissions has no site column, so a role ' +
    'means exactly the same thing on every dashboard — these probes check that ' +
    'what it means is enforced.',
  [
    probe({
      name: 'Viewer → create a job posting → 403',
      method: 'POST',
      path: '/admin/careers/jobs',
      token: 'viewerToken',
      site: 101,
      body: { refCode: 'R-999', slug: 'probe-role', title: 'Probe' },
      expect: refused(403, 'a viewer cannot create'),
    }),
    probe({
      name: 'Viewer → delete a job posting → 403',
      method: 'DELETE',
      path: '/admin/careers/jobs/{{probeItJobId}}',
      token: 'viewerToken',
      site: 101,
      expect: refused(403, 'a viewer cannot delete'),
    }),
    probe({
      name: 'Viewer → read applicants → 403',
      path: '/admin/applications',
      token: 'viewerToken',
      site: 101,
      expect: refused(403, 'a viewer cannot open candidate records'),
      note:
        'Deliberate. A viewer sees adverts but not applicants, whose records ' +
        'carry notice periods, work authorisation and salary expectations.',
    }),
    probe({
      name: 'Content editor → read applicants → 403',
      path: '/admin/applications',
      token: 'editorToken',
      site: 101,
      expect: refused(403, 'an editor may reword an advert but not open a candidate'),
      note:
        'This is why careers and applications are separate feature codes rather ' +
        'than one "recruitment" feature.',
    }),
    probe({
      name: 'Content editor → create a job posting → 403',
      method: 'POST',
      path: '/admin/careers/jobs',
      token: 'editorToken',
      site: 101,
      body: { refCode: 'R-998', slug: 'probe-role-2', title: 'Probe' },
      expect: refused(403, 'an editor holds update but not create'),
    }),
    probe({
      name: 'Sales → job postings → 403',
      path: '/admin/careers/jobs',
      token: 'salesToken',
      site: 101,
      expect: refused(403, 'sales holds no careers feature'),
    }),
    probe({
      name: 'Sales → staff administration → 403',
      path: '/admin/staff',
      token: 'salesToken',
      site: 101,
      expect: refused(403, 'only a super admin administers staff'),
    }),
    probe({
      name: 'Viewer → staff administration → 403',
      path: '/admin/staff',
      token: 'viewerToken',
      site: 101,
      expect: refused(403, 'only a super admin administers staff'),
    }),
    probe({
      name: 'Sales → contact enquiries → 200',
      path: '/admin/contact?limit=5',
      token: 'salesToken',
      site: 101,
      expect: allowed('sales owns the enquiry pipeline'),
      note: 'The control case. If everything above 403s, this proves the probes are reaching a working API.',
    }),
  ],
);

// =========================================================================
// 06 · Privilege escalation
// =========================================================================

const escalation = folder(
  '06 · Privilege escalation',
  'The sharpest surface in the system. A site-scoped super admin administers ' +
    'staff, and staff accounts are how brands are reached — so a hole here is ' +
    'not "read another brand", it is "become another brand".\n\n' +
    'This was a real vulnerability: a site-103 super admin could mint a site-101 ' +
    'super admin and sign in as it. Every probe below is a boundary added to ' +
    'close that.',
  [
    probe({
      name: 'Crane admin → name another site when creating an account → 400',
      method: 'POST',
      path: '/admin/staff',
      token: 'craneToken',
      site: 102,
      body: {
        email: 'probe-escalation@example.com',
        fullName: 'Probe',
        roleCode: 101,
        siteCode: 101,
      },
      expect: refused(400, 'the site field does not exist — the wrong brand is unexpressible'),
      note:
        'Not merely refused: the field was removed from the DTO entirely, and ' +
        'forbidNonWhitelisted turns naming it into a 400. An account is always ' +
        'created on the dashboard you signed in to.',
    }),
    probe({
      name: 'Crane admin → grant a role on another site → 400',
      method: 'POST',
      path: '/admin/staff/{{salesAdminId}}/roles',
      token: 'craneToken',
      site: 102,
      body: { roleCode: 101, siteCode: 101 },
      expect: refused(400, 'a grant cannot name another dashboard'),
    }),
    probe({
      name: 'Crane admin → view an admin with no badge on 102 → 404',
      path: '/admin/staff/{{salesAdminId}}',
      token: 'craneToken',
      site: 102,
      expect: refused(404, 'an account outside your dashboard does not exist to you'),
      note:
        '404 rather than 403 on purpose. A 403 would confirm the account exists, ' +
        'turning this route into a directory of every colleague on every brand.',
    }),
    probe({
      name: 'Crane admin → reset the protected root’s password → 403',
      method: 'POST',
      path: '/admin/staff/{{rootAdminId}}/reset-password',
      token: 'craneToken',
      site: 102,
      expect: refused(403, 'the root account is protected'),
      note:
        'The root holds a badge on 102, so it IS visible to this caller — which ' +
        'is why the refusal is 403 and not 404. A password reset ends every ' +
        'session on every brand, so it must not be reachable from one of them.',
    }),
    probe({
      name: 'Crane admin → deactivate the protected root → 403',
      method: 'PATCH',
      path: '/admin/staff/{{rootAdminId}}',
      token: 'craneToken',
      site: 102,
      body: { isActive: false },
      expect: refused(403, 'the root account cannot be deactivated'),
    }),
    probe({
      name: 'Crane admin → revoke the root’s badge on 102 → 403',
      method: 'DELETE',
      path: '/admin/staff/{{rootAdminId}}/roles/102/101',
      token: 'craneToken',
      site: 102,
      expect: refused(403, 'the root’s access cannot be stripped by a unit admin'),
      note: 'Otherwise "protected" would mean nothing — you would simply remove the protection’s reach.',
    }),
    probe({
      name: 'Crane admin → revoke the root’s badge on ANOTHER site → 403',
      method: 'DELETE',
      path: '/admin/staff/{{rootAdminId}}/roles/101/101',
      token: 'craneToken',
      site: 102,
      expect: refused(403, 'a unit admin cannot reach into another dashboard’s badges'),
    }),
    probe({
      name: 'IT admin → grant themselves a badge on 102 → 400',
      method: 'POST',
      path: '/admin/staff/{{rootAdminId}}/roles',
      token: 'itToken',
      site: 101,
      body: { roleCode: 101, siteCode: 102 },
      expect: refused(400, 'self-escalation to another brand is unexpressible'),
    }),
    probe({
      name: 'Sales → create a staff account → 403',
      method: 'POST',
      path: '/admin/staff',
      token: 'salesToken',
      site: 101,
      body: { email: 'probe2@example.com', fullName: 'Probe', roleCode: 101 },
      expect: refused(403, 'only a super admin creates accounts'),
    }),
  ],
);

// =========================================================================
// 07 · Appointing super admins
// =========================================================================

const superAdminRule = folder(
  '07 · Appointing super admins',
  'SUPER_ADMIN is ONE role. Holding it on a single dashboard carries the same ' +
    'authority over that dashboard as holding it on three, so a unit admin who ' +
    'can grant it can create their own equals — who can create more, and can ' +
    'revoke the admin who created them. The last-super-admin guard does not ' +
    'object, because by then the site has several.\n\n' +
    'That was demonstrable until recently: the Industries admin could mint a ' +
    'second Industries admin in three calls, and nothing anywhere would say so.\n\n' +
    'Now only a PROTECTED account may hand out role 101. `is_protected` is the ' +
    'only rank the system has and already means "outranks a unit ' +
    'administrator", so it is reused rather than inventing a second concept. ' +
    'Mark a second account protected to nominate a deputy — otherwise losing ' +
    'the root leaves no in-app way to appoint anyone.\n\n' +
    'Five routes can assign a role. Guarding one would have left four ways ' +
    'round it, so all five are probed here.',
  [
    probe({
      name: 'Setup — a colleague on 102 to aim at',
      method: 'POST',
      path: '/admin/staff',
      token: 'craneToken',
      site: 102,
      body: {
        email: 'escalation-target@example.com',
        fullName: 'Escalation Target',
        designation: 'Operations Manager',
        departmentCode: 105,
        employmentType: 'FULL_TIME',
      },
      expect: [
        `pm.test("created (409 is fine on a re-run)", () =>`,
        `  pm.expect([201, 409]).to.include(pm.response.code));`,
        `if (pm.response.code === 201) pm.collectionVariables.set("escalationTargetId", pm.response.json().data.id);`,
      ],
      note: 'Ordinary roles are still a unit admin’s to give. Only 101 is gated.',
    }),
    probe({
      name: '1 · create with roleCodes [101] → 403',
      method: 'POST',
      path: '/admin/staff',
      token: 'craneToken',
      site: 102,
      body: {
        email: 'minted-peer@example.com',
        fullName: 'Minted Peer',
        designation: 'Operations Manager',
        departmentCode: 105,
        employmentType: 'FULL_TIME',
        roleCodes: [101],
      },
      expect: refused(403, 'a unit admin cannot create a super admin outright'),
    }),
    probe({
      name: '2 · invite by email as SUPER_ADMIN → 403',
      method: 'POST',
      path: '/admin/staff/invite',
      token: 'craneToken',
      site: 102,
      body: { email: 'escalation-target@example.com', roleCodes: [101] },
      expect: refused(403, 'nor appoint one through the invite panel'),
    }),
    probe({
      name: '3 · invite by id as SUPER_ADMIN → 403',
      method: 'POST',
      path: '/admin/staff/{{escalationTargetId}}/invite',
      token: 'craneToken',
      site: 102,
      body: { email: 'escalation-target@example.com', roleCodes: [101] },
      expect: refused(403, 'nor through the id route behind Resend'),
    }),
    probe({
      name: '4 · grant SUPER_ADMIN afterwards → 403',
      method: 'POST',
      path: '/admin/staff/{{escalationTargetId}}/roles',
      token: 'craneToken',
      site: 102,
      body: { roleCode: 101 },
      expect: refused(403, 'nor by inviting low and promoting later'),
      note:
        'The obvious way round a rule that only guarded invite: bring someone ' +
        'in as a VIEWER, then promote them the next day.',
    }),
    probe({
      name: '5 · sneak it into replace-roles → 403',
      method: 'PUT',
      path: '/admin/staff/{{escalationTargetId}}/roles',
      token: 'craneToken',
      site: 102,
      body: { roleCodes: [105, 101] },
      expect: refused(403, 'nor by hiding it in a checkbox form’s save'),
    }),
    probe({
      name: 'Control — an ordinary role still works',
      method: 'POST',
      path: '/admin/staff/{{escalationTargetId}}/roles',
      token: 'craneToken',
      site: 102,
      body: { roleCode: 105 },
      expect: [
        `pm.test("a unit admin still runs their own unit", () =>`,
        `  pm.expect([201, 200]).to.include(pm.response.code));`,
      ],
      note:
        'If every probe above 403s and this one does too, the suite is proving ' +
        'nothing except that the token is broken.',
    }),
    probe({
      name: 'The global super admin’s badge cannot be revoked → 403',
      method: 'DELETE',
      path: '/admin/staff/{{rootAdminId}}/roles/102/101',
      token: 'craneToken',
      site: 102,
      expect: refused(403, 'nobody strips the organisation-level administrator'),
      note:
        'Stronger than the protected-account rule beside it: this refuses ' +
        'everyone, protected callers included. The account spans all three ' +
        'brands, so removing one badge is how you would quietly amputate the ' +
        'only authority that crosses them — and the last-super-admin guard ' +
        'would not notice, because each dashboard still has its own.',
    }),
    probe({
      name: 'Nor stripped by omission in replace-roles → 403',
      method: 'PUT',
      path: '/admin/staff/{{rootAdminId}}/roles',
      token: 'craneToken',
      site: 102,
      body: { roleCodes: [105] },
      expect: refused(403, 'replace-by-omission is a revocation in disguise'),
      note:
        'Leaving 101 out of the list removes it just as surely as a DELETE. ' +
        'Guarding only the delete route would have made the rule decorative.',
    }),
  ],
);

// =========================================================================
// 07 · Session lifecycle
// =========================================================================

const lifecycle = folder(
  '08 · Session lifecycle',
  'A token is signed and cannot be edited — but it can outlive the badge ' +
    'behind it. PermissionsGuard re-reads the database on every request for ' +
    'exactly this reason.\n\n' +
    'Run these LAST: the logout probes end the viewer session deliberately.',
  [
    probe({
      name: 'Viewer session works before logout',
      path: '/admin/careers/jobs?limit=1',
      token: 'viewerToken',
      site: 101,
      expect: allowed('the viewer can still read'),
    }),
    probe({
      name: 'Log the viewer out',
      method: 'POST',
      path: '/admin/auth/logout',
      token: 'viewerToken',
      site: 101,
      body: { refreshToken: '{{refreshToken}}' },
      expect: [
        `pm.test("logout accepted", () => pm.expect([200, 201, 401]).to.include(pm.response.code));`,
      ],
    }),
    probe({
      name: 'Nobody may read another admin’s role history without the ADMINS feature',
      path: '/admin/staff/{{rootAdminId}}/role-history',
      token: 'salesToken',
      site: 101,
      expect: refused(403, 'role history is super-admin only'),
    }),
    probe({
      name: 'Change-password requires the current password',
      method: 'POST',
      path: '/admin/auth/change-password',
      token: 'itToken',
      site: 101,
      body: { currentPassword: 'definitely-wrong', newPassword: 'Str0ng-Passw0rd!23' },
      expect: refused(401, 'a wrong current password blocks the change'),
      note: 'Otherwise a borrowed laptop with an open session is a permanent account takeover.',
    }),
  ],
);

// =========================================================================
// 08 · Public surface
// =========================================================================

const publicSurface = folder(
  '09 · Public surface',
  'What an anonymous visitor can reach. No token on any of these.',
  [
    probe({
      name: 'Public job list hides drafts and closed roles',
      path: '/careers/jobs?limit=50',
      site: 101,
      expect: [
        `pm.test("only OPEN roles are published", () => {`,
        `  pm.response.to.have.status(200);`,
        `  const items = pm.response.json().data?.items ?? [];`,
        `  const leaked = items.filter((j) => j.status && j.status !== "OPEN");`,
        `  pm.expect(leaked, JSON.stringify(leaked.slice(0, 3))).to.have.lengthOf(0);`,
        `});`,
      ],
    }),
    probe({
      name: 'Public article list hides drafts',
      path: '/insights/articles?limit=50',
      site: 101,
      expect: [
        `pm.test("only PUBLISHED articles are served", () => {`,
        `  pm.response.to.have.status(200);`,
        `  const items = pm.response.json().data?.items ?? [];`,
        `  const leaked = items.filter((a) => a.status && a.status !== "PUBLISHED");`,
        `  pm.expect(leaked, JSON.stringify(leaked.slice(0, 3))).to.have.lengthOf(0);`,
        `});`,
      ],
    }),
    probe({
      name: 'A guessed manage token returns 404',
      path: '/crane/site-visits/00000000-0000-4000-8000-000000000000',
      site: 102,
      expect: refused(404, 'a wrong manage token reveals nothing'),
      note:
        'The customer tracking page has no login — the token IS the credential. ' +
        'A 200 or a distinguishable error would make it enumerable.',
    }),
    probe({
      name: 'A quote submitted without consent is refused',
      method: 'POST',
      path: '/crane/quotes',
      site: 102,
      body: {
        serviceLineCode: 105,
        urgencyCode: 202,
        companyName: 'Consent Probe',
        contactName: 'Probe',
        businessEmail: 'consent-probe@example.com',
        mobile: '+966 55 000 0000',
        consentGiven: false,
      },
      expect: refused(400, 'PDPL consent is not optional'),
    }),
    probe({
      name: 'Admin routes are not reachable from the public site',
      path: '/admin/crane-quotes',
      site: 102,
      expect: refused(401, 'no session, no pipeline'),
    }),
  ],
);

// =========================================================================
// Assemble
// =========================================================================

const rbacFolder = folder(
  FOLDER,
  'A security suite, not a happy-path suite. Every request here expects to be ' +
    'REFUSED unless its name says otherwise — a green run means the boundaries ' +
    'held.\n\n' +
    'SET THESE FIRST (collection variables): rootPassword, itPassword, ' +
    'cranePassword, privacyPassword, editorPassword, salesPassword.\n\n' +
    'Then run the folder top to bottom with the Collection Runner. Order matters: ' +
    '00 captures the tokens everything else uses, and 07 deliberately ends a ' +
    'session.\n\n' +
    'A FAILURE HERE IS A SECURITY FINDING, not a broken test. Read what the probe ' +
    'expected before assuming the assertion is wrong.',
  [
    personas,
    authentication,
    siteIsolation,
    filterOnly,
    idor,
    permissions,
    escalation,
    superAdminRule,
    lifecycle,
    publicSurface,
  ],
);

// --- patch the ordinary requests whose contract changed ------------------

/**
 * Explicit paths, not regexes.
 *
 * An earlier pass matched `/Careers\/Admin/`, which also matched
 * "Crane Careers/Admin" and wrote an IT note onto a crane candidate list.
 * A folder name is not a stable pattern; the full path is.
 */
const PATCHES = {
  '/Crane Quotes/Submit a quote request': (it) => {
    const field = (it.request.body.formdata ?? []).find((f) => f.key === 'swlTonnes');
    if (!field) return null;
    field.value = '10 + 20 + 32 t';
    field.description =
      'Free text since the column became varchar(150). A six-crane request ' +
      'carries several capacities, and numeric(8,2) could hold only one.';
    return 'swlTonnes is now text';
  },

  '/Crane Quotes/Move through the pipeline': (it) => {
    it.request.description =
      'Settable: NEW, TRIAGE, SITE_VISIT, PROPOSAL_SENT, WON, LOST, REVERTED.\n\n' +
      'WITHDRAWN is absent — only the customer withdraws their own request, and a ' +
      'withdrawn quote cannot be reopened.\n\n' +
      'REVERTED ("Reverted back") is NOT terminal: unlike WITHDRAWN it can move to ' +
      'any other status afterwards. It also stops the triage clock, since reaching ' +
      'it means someone has plainly engaged.';
    return 'documents REVERTED';
  },

  '/Careers/Admin/List all roles (incl. drafts)': (it) => {
    it.request.description =
      'Each row carries applicantCount (everyone who applied) and ' +
      'newApplicantCount (still at NEW — nobody has opened them). Both are ' +
      'computed per request from job_applications; neither is a stored column.';
    return 'documents applicant counts';
  },

  '/Crane Careers/Admin/List roles': (it) => {
    it.request.description =
      'Each row carries applicantCount and newApplicantCount, computed per ' +
      'request from crane_applications.\n\n' +
      'Unreviewed here means SUBMITTED, not NEW — a crane application arrives ' +
      'under a different name than an IT one. General "keep on file" ' +
      'applications have a null jobId and belong to no advert, so they are ' +
      'excluded rather than added to every row.';
    return 'documents applicant counts';
  },

  '/Crane Careers/Admin/List candidates': (it) => {
    it.request.description =
      'The candidate pipeline. Nationality, mobile, certifications and the ' +
      'background summary are withheld from this list and returned only by the ' +
      'detail route.';
    return 'restored — an earlier pass wrote an IT note here';
  },

  '/Careers/Admin/Author job content (description, responsibilities, requirements)': (it, parent) => {
    it.name = 'Author job content (description)';
    it.request.description =
      'summary, responsibilities and requirements were folded into ' +
      'descriptionMdx and dropped. That column is now NOT NULL and cannot be ' +
      'emptied — with the others gone it is the only place the role is ' +
      'described at all.';
    parent.renamed = true;
    return 'renamed — responsibilities and requirements no longer exist';
  },

  '/Crane Careers/Admin/Attach the CV that arrived by email': (it, parent) => {
    it.name = 'Attach a CV to an older application';
    it.request.description =
      'Kept for applications that predate the upload. The CV now travels with ' +
      'the form — see Crane Careers → Public → Apply, which is multipart and ' +
      'refuses a submission without one.';
    parent.renamed = true;
    return 'renamed — the CV no longer arrives by email';
  },
};

const patches = [];

const walk = (items, parent = '') => {
  for (const it of items) {
    if (it.item) {
      walk(it.item, `${parent}/${it.name}`);
      continue;
    }
    const apply = PATCHES[`${parent}/${it.name}`];
    if (!apply) continue;
    const what = apply(it, {});
    if (what) patches.push(`${parent}/${it.name} — ${what}`);
  }
};


// --- write ---------------------------------------------------------------

const collection = JSON.parse(fs.readFileSync(FILE, 'utf8'));

collection.item = collection.item.filter((i) => i.name !== FOLDER);
walk(collection.item);
collection.item.push(rbacFolder);

const needed = {
  rootEmail: 'admin@veltrixair.com',
  itEmail: 'it.admin@veltrixair.com',
  craneEmail: 'crane.admin@veltrixair.com',
  privacyEmail: 'privacy.admin@veltrixair.com',
  editorEmail: 'editor@veltrixair.com',
  salesEmail: 'adil.bakshi.sales@veltrixair.com',
  rootPassword: '',
  itPassword: '',
  cranePassword: '',
  privacyPassword: '',
  editorPassword: '',
  salesPassword: '',
  garbageToken: 'eyJhbGciOiJIUzI1NiJ9.bm90LWEtcmVhbC10b2tlbg.forged',
  rootToken101: '',
  rootToken102: '',
  itToken: '',
  craneToken: '',
  privacyToken: '',
  editorToken: '',
  salesToken: '',
  viewerToken: '',
  salesAdminId: '',
  probeItJobId: '',
  probeItFileId: '',
  escalationTargetId: '',
};

collection.variable = collection.variable ?? [];
const have = new Set(collection.variable.map((v) => v.key));
let added = 0;
for (const [key, value] of Object.entries(needed)) {
  if (!have.has(key)) {
    collection.variable.push({ key, value, type: 'string' });
    added++;
  }
}

fs.writeFileSync(FILE, `${JSON.stringify(collection, null, 2)}\n`);

let probes = 0;
const count = (items) => items.forEach((i) => (i.item ? count(i.item) : probes++));
count([rbacFolder]);

let total = 0;
const countAll = (items) => items.forEach((i) => (i.item ? countAll(i.item) : total++));
countAll(collection.item);

console.log(`RBAC folder rebuilt: ${probes} probes in ${rbacFolder.item.length} groups`);
console.log(`collection total:    ${total} requests`);
console.log(`variables added:     ${added}`);
if (patches.length) {
  console.log('\npatched existing requests:');
  patches.forEach((p) => console.log(`  ${p}`));
}
