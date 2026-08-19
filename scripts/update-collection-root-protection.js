/**
 * Adds the protected-account behaviour to the Staff folder.
 *
 *   node scripts/update-collection-root-protection.js
 *
 * There is no new route — protection is a guard, not an endpoint — so route
 * coverage does not change. It is worth a request anyway: it is the one rule
 * that makes a unit administrator's authority stop short of something, and a
 * collection that only shows the happy path teaches the wrong model.
 *
 * Idempotent — re-running replaces the request rather than duplicating it.
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

if (!collection.variable.find((v) => v.key === 'rootAdminId')) {
  collection.variable.push({ key: 'rootAdminId', value: '', type: 'string' });
}

const staff = collection.item.find((f) => f.name === 'Staff');
if (!staff) throw new Error('No "Staff" folder in the collection.');

/* The root is the account holding a badge on more than one dashboard. */
const list = staff.item.find((i) => i.name === 'List staff');
if (list) {
  list.event = [
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          'const body = pm.response.json();',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('everyone listed holds a badge on this dashboard', () =>",
          '  body.data.items.forEach((m) =>',
          '    pm.expect((m.roles || []).some(',
          '      (r) => String(r.siteCode) === String(pm.collectionVariables.get("siteCode")),',
          '    )).to.eql(true)));',
          '',
          '// The root account is the one with access to more than one brand.',
          'const root = body.data.items.find((m) =>',
          '  new Set((m.roles || []).map((r) => r.siteCode)).size > 1);',
          'if (root) {',
          "  pm.collectionVariables.set('rootAdminId', root.id);",
          '}',
        ],
      },
    },
  ];
}

const NOTE =
  '\n\nRefused with 403 against a PROTECTED account. The root holds a badge on ' +
  'every brand, so it appears on every unit administrator’s list — but only ' +
  'another protected account may change it. Without that rank, the moment a ' +
  'unit gains its own super admin the two hold identical badges there and ' +
  'either can remove the other.';

for (const name of ['Revoke one badge', 'Rename / deactivate', 'Reset password']) {
  const request = staff.item.find((i) => i.name === name);
  if (request && !(request.request.description ?? '').includes('PROTECTED')) {
    request.request.description = (request.request.description ?? '') + NOTE;
  }
}

const NAME = 'Touch the root account (expect 403)';
staff.item = staff.item.filter((i) => i.name !== NAME);
staff.item.push({
  name: NAME,
  event: [
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          "pm.test('403 — the root is not a unit administrator\\'s to change', () =>",
          '  pm.response.to.have.status(403));',
          "pm.test('and the refusal says why', () =>",
          "  pm.expect(pm.response.json().message).to.include('organisation'));",
        ],
      },
    },
  ],
  request: {
    method: 'DELETE',
    header: [],
    url: {
      raw: '{{baseUrl}}/admin/staff/{{rootAdminId}}/roles/{{siteCode}}/101',
      host: ['{{baseUrl}}'],
      path: [
        'admin',
        'staff',
        '{{rootAdminId}}',
        'roles',
        '{{siteCode}}',
        '101',
      ],
    },
    description:
      'Sign in as a UNIT administrator first — it.admin@, crane.admin@ or ' +
      'privacy.admin@ — with {{siteCode}} set to their dashboard, then run ' +
      'List staff to capture {{rootAdminId}}.\n\n' +
      'This tries to strip the root account of its badge on that very ' +
      'dashboard, which every other rule would allow: it is the caller’s own ' +
      'site, the account is visible to them, and the unit would still have a ' +
      'super admin afterwards — themselves. Only is_protected stops it.\n\n' +
      'Signed in as the root instead, the same request succeeds, which is why ' +
      'it is a rank rather than a lock.',
  },
  response: [],
});

fs.writeFileSync(FILE, `${JSON.stringify(collection, null, 2)}\n`);

const count = (nodes) =>
  nodes.reduce((n, x) => n + (x.item ? count(x.item) : 1), 0);
console.log(
  `Staff folder now has ${staff.item.length} requests; ` +
    `${count(collection.item)} in the collection.`,
);
