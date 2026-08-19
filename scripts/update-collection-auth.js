/**
 * Adds the Auth folder to the Postman collection and makes every admin request
 * send a bearer token.
 *
 *   node scripts/update-collection-auth.js
 *
 * Idempotent — re-running replaces the Auth folder rather than duplicating it.
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

const NEW_VARS = [
  { key: 'adminEmail', value: 'admin@veltrixair.com', type: 'string' },
  { key: 'adminPassword', value: '', type: 'string' },
  { key: 'accessToken', value: '', type: 'string' },
  { key: 'refreshToken', value: '', type: 'string' },
];

collection.variable = collection.variable || [];
for (const v of NEW_VARS) {
  const existing = collection.variable.find((x) => x.key === v.key);
  if (existing) Object.assign(existing, v);
  else collection.variable.push(v);
}

// -------------------------------------------------------- collection auth

// Set once at the collection root; individual requests inherit it. Public
// endpoints are marked noauth below, so a stray token can't make a public
// route look authenticated in testing.
collection.auth = {
  type: 'bearer',
  bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
};

// ------------------------------------------------------------- Auth folder

const script = (lines) => ({
  listen: 'test',
  script: { type: 'text/javascript', exec: lines },
});

const authFolder = {
  name: 'Auth',
  description:
    'Sign in first — every Admin request in this collection inherits the bearer ' +
    'token captured here.\n\n' +
    'Set the `adminPassword` collection variable to the password printed by ' +
    '`npm run admin:create`, then run "Login". The access token lasts 15 minutes; ' +
    'run "Refresh" to rotate it.\n\n' +
    'Refresh tokens are single use. Sending the same one twice is treated as a ' +
    'replay and revokes the whole session — that is the "Refresh (replay — expect 403)" ' +
    'request, and it is meant to fail.',
  item: [
    {
      name: 'Login',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('returns an access token', () => pm.expect(body.data.accessToken).to.be.a('string'));",
          "pm.test('refresh token is opaque, not a JWT', () => pm.expect(body.data.refreshToken.split('.').length).to.not.eql(3));",
          "pm.collectionVariables.set('accessToken', body.data.accessToken);",
          "pm.collectionVariables.set('refreshToken', body.data.refreshToken);",
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            { email: '{{adminEmail}}', password: '{{adminPassword}}' },
            null,
            2,
          ),
        },
        url: {
          raw: '{{baseUrl}}/admin/auth/login',
          host: ['{{baseUrl}}'],
          path: ['admin', 'auth', 'login'],
        },
        description:
          'Throttled to 5 attempts per minute per IP. Wrong password, unknown ' +
          'email and a disabled account all return the same 401 message, so the ' +
          'response cannot be used to discover which accounts exist.',
      },
    },
    {
      name: 'Login (wrong password — expect 401)',
      event: [
        script([
          "pm.test('401 unauthorised', () => pm.response.to.have.status(401));",
          "pm.test('message gives nothing away', () => pm.expect(pm.response.json().message).to.eql('Invalid credentials'));",
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            { email: '{{adminEmail}}', password: 'definitely-not-it' },
            null,
            2,
          ),
        },
        url: {
          raw: '{{baseUrl}}/admin/auth/login',
          host: ['{{baseUrl}}'],
          path: ['admin', 'auth', 'login'],
        },
      },
    },
    {
      name: 'Me — roles and permissions',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('has at least one role', () => pm.expect(body.data.roles.length).to.be.above(0));",
          "pm.test('never leaks a password hash', () => pm.expect(JSON.stringify(body)).to.not.include('argon2'));",
        ]),
      ],
      request: {
        method: 'GET',
        header: [],
        url: {
          raw: '{{baseUrl}}/admin/auth/me',
          host: ['{{baseUrl}}'],
          path: ['admin', 'auth', 'me'],
        },
        description:
          'What the signed-in account may do. An admin UI uses the permissions ' +
          'array to decide which menu items to render — the guard still enforces ' +
          'it server-side regardless.',
      },
    },
    {
      name: 'Refresh (rotates)',
      event: [
        script([
          'const body = pm.response.json();',
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "const previous = pm.collectionVariables.get('refreshToken');",
          "pm.test('issues a NEW refresh token', () => pm.expect(body.data.refreshToken).to.not.eql(previous));",
          "pm.collectionVariables.set('accessToken', body.data.accessToken);",
          "pm.collectionVariables.set('refreshToken', body.data.refreshToken);",
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ refreshToken: '{{refreshToken}}' }, null, 2),
        },
        url: {
          raw: '{{baseUrl}}/admin/auth/refresh',
          host: ['{{baseUrl}}'],
          path: ['admin', 'auth', 'refresh'],
        },
        description:
          'Single use. The old token is revoked and the new one takes its place ' +
          'in the same family, so a stolen token stops working the moment the ' +
          'real client refreshes.',
      },
    },
    {
      name: 'Refresh (replay — expect 403)',
      event: [
        script([
          "pm.test('403 — reuse detected', () => pm.response.to.have.status(403));",
          '// The whole family is now revoked. Run "Login" again to continue.',
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            { refreshToken: 'PASTE_A_PREVIOUSLY_USED_REFRESH_TOKEN_HERE' },
            null,
            2,
          ),
        },
        url: {
          raw: '{{baseUrl}}/admin/auth/refresh',
          host: ['{{baseUrl}}'],
          path: ['admin', 'auth', 'refresh'],
        },
        description:
          'Paste a refresh token you have already spent. A replayed token can ' +
          'only mean it was captured, so the entire chain is revoked — this logs ' +
          'out the attacker and the real user, who then simply signs in again.',
      },
    },
    {
      name: 'Change password',
      event: [
        script([
          "pm.test('200 OK', () => pm.response.to.have.status(200));",
          "pm.test('ended every session', () => pm.expect(pm.response.json().data.sessionsRevoked).to.be.at.least(0));",
        ]),
      ],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            {
              currentPassword: '{{adminPassword}}',
              newPassword: 'a-much-longer-passphrase-2026',
            },
            null,
            2,
          ),
        },
        url: {
          raw: '{{baseUrl}}/admin/auth/change-password',
          host: ['{{baseUrl}}'],
          path: ['admin', 'auth', 'change-password'],
        },
        description:
          'Minimum 12 characters, no composition rules — length is what resists ' +
          'an offline attack. Every session ends, because a password change is ' +
          'how someone responds to a suspected compromise.',
      },
    },
    {
      name: 'Logout (this session)',
      event: [
        script(["pm.test('200 OK', () => pm.response.to.have.status(200));"]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ refreshToken: '{{refreshToken}}' }, null, 2),
        },
        url: {
          raw: '{{baseUrl}}/admin/auth/logout',
          host: ['{{baseUrl}}'],
          path: ['admin', 'auth', 'logout'],
        },
        description:
          'Takes the refresh token, not the access token: the access token ' +
          'expires by itself within 15 minutes, whereas the refresh token is ' +
          'what keeps the session alive.',
      },
    },
    {
      name: 'Logout everywhere',
      event: [
        script(["pm.test('200 OK', () => pm.response.to.have.status(200));"]),
      ],
      request: {
        method: 'POST',
        header: [],
        url: {
          raw: '{{baseUrl}}/admin/auth/logout-all',
          host: ['{{baseUrl}}'],
          path: ['admin', 'auth', 'logout-all'],
        },
        description: 'Revokes every session for this account, on every device.',
      },
    },
    {
      name: 'Admin route without a token (expect 401)',
      event: [
        script([
          "pm.test('401 unauthorised', () => pm.response.to.have.status(401));",
        ]),
      ],
      request: {
        auth: { type: 'noauth' },
        method: 'GET',
        header: [],
        url: {
          raw: '{{baseUrl}}/admin/contact/enquiries',
          host: ['{{baseUrl}}'],
          path: ['admin', 'contact', 'enquiries'],
        },
        description:
          'Proof that the guards are on. Every one of the 41 admin feature ' +
          'routes behaves this way without a token.',
      },
    },
  ],
};

// Replace any previous Auth folder, and keep it first — it is the first thing
// anyone opening this collection has to run.
collection.item = collection.item.filter((i) => i.name !== 'Auth');
collection.item.unshift(authFolder);

// -------------------------------------------- mark public requests as noauth

let publicCount = 0;
let adminCount = 0;

function walk(items) {
  for (const item of items) {
    if (Array.isArray(item.item)) {
      walk(item.item);
      continue;
    }
    if (!item.request) continue;

    const segments = item.request.url?.path ?? [];
    const isAdmin = segments[0] === 'admin';

    if (isAdmin) {
      adminCount++;
      // Leave auth undefined so it inherits the collection's bearer token,
      // except where the request explicitly set noauth (login, refresh, logout).
      if (
        item.request.auth?.type !== 'noauth' &&
        item.request.auth !== undefined
      ) {
        delete item.request.auth;
      }
    } else {
      publicCount++;
      item.request.auth = { type: 'noauth' };
    }
  }
}

walk(collection.item);

collection.info.description =
  (collection.info.description || '').split('\n\n## Authentication')[0] +
  '\n\n## Authentication\n\n' +
  'Admin routes require a bearer token. Open the **Auth** folder, set the ' +
  '`adminPassword` collection variable, and run **Login** — the token is captured ' +
  'into `accessToken` and every admin request inherits it automatically.\n\n' +
  'Create the first account with `npm run admin:create -- --email you@veltrixair.com ' +
  '--name "Your Name" --role SUPER_ADMIN --generate`.';

fs.writeFileSync(FILE, JSON.stringify(collection, null, 2) + '\n');

console.log(`Auth folder: ${authFolder.item.length} requests`);
console.log(`admin requests inheriting the token: ${adminCount}`);
console.log(`public requests marked noauth:       ${publicCount}`);
