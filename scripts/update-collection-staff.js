/**
 * Adds the Staff folder to the Postman collection.
 *
 *   node scripts/update-collection-staff.js
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

const NEW_VARS = [{ key: 'staffId', value: '', type: 'string' }];
collection.variable = collection.variable || [];
for (const v of NEW_VARS) {
  if (!collection.variable.find((x) => x.key === v.key)) {
    collection.variable.push(v);
  }
}

const script = (lines) => ({
  listen: 'test',
  script: { type: 'text/javascript', exec: lines },
});

const json = (value) => ({
  mode: 'raw',
  raw: JSON.stringify(value, null, 2),
});

const url = (segments, raw) => ({
  raw: `{{baseUrl}}/${raw ?? segments.join('/')}`,
  host: ['{{baseUrl}}'],
  path: segments,
});

const staffFolder = {
  name: 'Staff',
  description:
    'Staff accounts and the roles they hold. Every route needs the ADMINS ' +
    'feature, which only SUPER_ADMIN carries — sign in as a super admin from ' +
    'the Auth folder first.\n\n' +
    'Note what is NOT here: there is no way to change what a role *means*. ' +
    'The role→permission matrix is read-only (see "List roles") and changes ' +
    'only by migration, so widening a role stays a reviewed act.\n\n' +
    'Guard rails you can test: you cannot change your own roles or deactivate ' +
    'yourself, an account cannot be left with zero roles, and the last active ' +
    'SUPER_ADMIN cannot be demoted or deactivated.',
  item: [
    {
      name: 'List staff',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          'if (body.data && body.data.items && body.data.items.length) {',
          "  pm.collectionVariables.set('staffId', body.data.items[0].id);",
          '}',
          "pm.test('never returns a password hash', () => pm.expect(JSON.stringify(body)).to.not.include('argon2'));",
        ]),
      ],
      request: {
        method: 'GET',
        header: [],
        url: {
          raw: '{{baseUrl}}/admin/staff?page=1&limit=10',
          host: ['{{baseUrl}}'],
          path: ['admin', 'staff'],
          query: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' },
            { key: 'search', value: 'admin', disabled: true },
            { key: 'roleCode', value: '101', disabled: true },
            { key: 'isActive', value: 'true', disabled: true },
          ],
        },
        description:
          'Search matches name or email. Filter by roleCode to answer "who ' +
          'can do X" — it only counts live assignments, not revoked ones.',
      },
    },
    {
      name: 'List roles and what they grant',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('returns the five seeded roles', () => pm.expect(body.data.length).to.eql(5));",
          "const superAdmin = body.data.find((r) => r.code === 101);",
          "pm.test('SUPER_ADMIN covers every feature', () => pm.expect(superAdmin.permissions.length).to.eql(24));",
        ]),
      ],
      request: {
        method: 'GET',
        header: [],
        url: url(['admin', 'staff', 'roles']),
        description:
          'Read-only. This is what a role picker renders from — it shows the ' +
          'matrix but there is no endpoint to write it.\n\n' +
          'Features: 101 CONTACT, 102 CAREERS, 103 INSIGHTS, 104 DISCOVERY, ' +
          '105 FILES, 106 ADMINS.\n' +
          'Permissions: 101 VIEW, 102 CREATE, 103 UPDATE, 104 DELETE.',
      },
    },
    {
      name: 'Create a staff account',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('201 created', () => pm.response.to.have.status(201));",
          "pm.test('returns a one-time password', () => pm.expect(body.data.temporaryPassword).to.be.a('string'));",
          "pm.collectionVariables.set('staffId', body.data.id);",
          'console.log(`Temporary password for ${body.data.email}: ${body.data.temporaryPassword}`);',
        ]),
      ],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({
          email: 'new.colleague@veltrixair.com',
          fullName: 'New Colleague',
          roleCodes: [103],
        }),
        url: url(['admin', 'staff']),
        description:
          'The password is generated server-side and returned ONCE. Hand it ' +
          'over on a channel you trust and have them change it at first ' +
          'sign-in — it is stored only as an argon2id hash and cannot be shown ' +
          'again.\n\nAt least one role is required: an account with none can ' +
          'sign in and then be refused everywhere, which reads like a bug.',
      },
    },
    {
      name: 'Get one staff member',
      request: {
        method: 'GET',
        header: [],
        url: url(['admin', 'staff', '{{staffId}}']),
      },
    },
    {
      name: 'Grant one role',
      event: [
        script([
          "pm.test('201 created', () => pm.response.to.have.status(201));",
          "pm.test('role now held', () => pm.expect(pm.response.json().data.roles.map((r) => r.code)).to.include(102));",
        ]),
      ],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ roleCode: 102 }),
        url: url(['admin', 'staff', '{{staffId}}', 'roles']),
        description:
          'Idempotent — granting a role already held is a no-op, not an error. ' +
          'Takes effect on the target\'s very next request; they do not have to ' +
          'sign in again.',
      },
    },
    {
      name: 'Revoke one role',
      event: [
        script(["pm.test('200 OK', () => pm.response.to.have.status(200));"]),
      ],
      request: {
        method: 'DELETE',
        header: [],
        url: url(['admin', 'staff', '{{staffId}}', 'roles', '102']),
        description:
          'Soft-delete: the assignment row stays with revokedAt and revokedBy ' +
          'set, so the audit trail survives. Revoking a role not held is a ' +
          'no-op. Revoking the last remaining role returns 409 — deactivate ' +
          'the account instead.',
      },
    },
    {
      name: 'Replace the whole role set',
      event: [
        script([
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('holds exactly what was sent', () => pm.expect(pm.response.json().data.roles.map((r) => r.code)).to.eql([104, 105]));",
        ]),
      ],
      request: {
        method: 'PUT',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ roleCodes: [104, 105] }),
        url: url(['admin', 'staff', '{{staffId}}', 'roles']),
        description:
          'For a checkbox form that saves once. Unchanged roles are left ' +
          'alone rather than revoked and re-granted, so an assignment keeps ' +
          'its original assignedBy and date.',
      },
    },
    {
      name: 'Role history (audit trail)',
      event: [
        script([
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('includes revoked assignments', () => pm.expect(pm.response.json().data.some((r) => r.revokedAt !== null)).to.be.true);",
        ]),
      ],
      request: {
        method: 'GET',
        header: [],
        url: url(['admin', 'staff', '{{staffId}}', 'role-history']),
        description:
          'Every assignment ever made, live and revoked, with who granted it ' +
          'and who took it away. This is why revocation is a soft delete.',
      },
    },
    {
      name: 'Rename / deactivate',
      event: [
        script(["pm.test('200 OK', () => pm.response.to.have.status(200));"]),
      ],
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ fullName: 'Renamed Colleague', isActive: false }),
        url: url(['admin', 'staff', '{{staffId}}']),
        description:
          'Deactivating revokes every refresh token immediately — otherwise an ' +
          'offboarded account keeps working for up to a week. Accounts are ' +
          'never deleted: audit rows point at them.',
      },
    },
    {
      name: 'Reset password',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('201 created', () => pm.response.to.have.status(201));",
          'console.log(`New temporary password: ${body.data.temporaryPassword}`);',
        ]),
      ],
      request: {
        method: 'POST',
        header: [],
        url: url(['admin', 'staff', '{{staffId}}', 'reset-password']),
        description:
          'Issues a new one-time password and ends every session that account ' +
          'has open. Use when someone is locked out or a password may have leaked.',
      },
    },
    {
      name: 'Change your own roles (expect 403)',
      event: [
        script([
          "pm.test('403 forbidden', () => pm.response.to.have.status(403));",
        ]),
      ],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: json({ roleCode: 101 }),
        url: url(['admin', 'staff', 'PASTE_YOUR_OWN_ADMIN_ID', 'roles']),
        description:
          'Paste your own id (from GET /admin/auth/me). Blocked deliberately: ' +
          'it prevents self-escalation and self-lockout with one rule, and ' +
          'means a second super admin has to make the change — so two names ' +
          'end up in the trail.',
      },
    },
  ],
};

collection.item = collection.item.filter((i) => i.name !== 'Staff');

// Directly after Auth: both are about who can use the system, and neither is
// part of the public site.
const authIndex = collection.item.findIndex((i) => i.name === 'Auth');
collection.item.splice(authIndex + 1, 0, staffFolder);

fs.writeFileSync(FILE, JSON.stringify(collection, null, 2) + '\n');

console.log(`Staff folder: ${staffFolder.item.length} requests`);
console.log(`collection folders: ${collection.item.map((i) => i.name).join(' | ')}`);
