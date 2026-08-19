/**
 * Adds silent token auto-refresh to the Postman collection.
 *
 *   node scripts/update-collection-autorefresh.js
 *
 * The problem it solves: access tokens live 15 minutes, and a real frontend
 * renews them with an HTTP interceptor that catches a 401, refreshes and
 * retries. Postman has no such thing, so testing means hitting 401 every
 * quarter of an hour and manually running Refresh.
 *
 * A collection-level pre-request script is the closest equivalent. It runs
 * before every request and renews the token when it is about to expire.
 *
 * Expiry is tracked from the `expiresIn` field the API already returns, stored
 * as an absolute timestamp at login. That avoids decoding the JWT in the
 * sandbox, where base64 helpers vary between Postman versions.
 *
 * Idempotent — re-running replaces the script rather than stacking copies.
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

// -------------------------------------------------------------- variables

if (!collection.variable.find((v) => v.key === 'tokenExpiresAt')) {
  collection.variable.push({
    key: 'tokenExpiresAt',
    value: '0',
    type: 'string',
  });
}

// ----------------------------------------------------- pre-request script

const PRE_REQUEST = [
  '// Auto-refresh the access token before it expires.',
  '//',
  '// Mirrors what a frontend HTTP interceptor does, so the 15-minute access',
  '// token lifetime stays invisible while testing. Refresh tokens are single',
  '// use, so both values are rewritten together on every renewal.',
  '',
  '(function autoRefresh() {',
  '  const url = pm.request.url.toString();',
  '',
  '  // Only admin routes carry a token, and the auth routes must not be',
  '  // intercepted: login has no token yet, and refresh/logout would recurse.',
  '  if (!/\\/admin\\//.test(url)) return;',
  '  if (/\\/admin\\/auth\\/(login|refresh|logout)/.test(url)) return;',
  '',
  '  const refreshToken = pm.collectionVariables.get("refreshToken");',
  '  if (!refreshToken) {',
  '    console.warn("No refresh token yet — run Auth > Login first.");',
  '    return;',
  '  }',
  '',
  '  // Renew a minute early so a token cannot expire mid-flight.',
  '  const SKEW_MS = 60 * 1000;',
  '  const expiresAt = Number(pm.collectionVariables.get("tokenExpiresAt") || 0);',
  '  if (expiresAt && Date.now() < expiresAt - SKEW_MS) return;',
  '',
  '  pm.sendRequest(',
  '    {',
  '      url: pm.collectionVariables.get("baseUrl") + "/admin/auth/refresh",',
  '      method: "POST",',
  '      header: { "Content-Type": "application/json" },',
  '      body: { mode: "raw", raw: JSON.stringify({ refreshToken: refreshToken }) },',
  '    },',
  '    function (err, res) {',
  '      if (err || !res || res.code !== 200) {',
  '        // 403 means the refresh token was already spent — the server treats',
  '        // a replay as a compromise and revokes the whole family. Logging in',
  '        // again is the only way forward, and that is intended.',
  '        console.warn(',
  '          "Auto-refresh failed (" + (res ? res.code : err) + "). Run Auth > Login again."',
  '        );',
  '        return;',
  '      }',
  '      const data = res.json().data;',
  '      pm.collectionVariables.set("accessToken", data.accessToken);',
  '      pm.collectionVariables.set("refreshToken", data.refreshToken);',
  '      pm.collectionVariables.set(',
  '        "tokenExpiresAt",',
  '        String(Date.now() + data.expiresIn * 1000)',
  '      );',
  '      console.log("Access token auto-refreshed; valid " + data.expiresIn + "s.");',
  '    }',
  '  );',
  '})();',
];

collection.event = (collection.event || []).filter(
  (e) => e.listen !== 'prerequest',
);
collection.event.push({
  listen: 'prerequest',
  script: { type: 'text/javascript', exec: PRE_REQUEST },
});

// ------------------------------- record expiry wherever tokens are issued

const STAMP = [
  '// Record when this token dies, so the collection pre-request script knows',
  '// when to renew it.',
  'pm.collectionVariables.set(',
  '  "tokenExpiresAt",',
  '  String(Date.now() + pm.response.json().data.expiresIn * 1000)',
  ');',
];

let stamped = 0;

function walk(items) {
  for (const item of items) {
    if (Array.isArray(item.item)) {
      walk(item.item);
      continue;
    }
    // Only the two requests that mint a token pair.
    if (item.name !== 'Login' && item.name !== 'Refresh (rotates)') continue;

    const test = (item.event || []).find((e) => e.listen === 'test');
    if (!test) continue;

    // Drop any previous stamp before re-adding, so re-running does not stack.
    const marker = STAMP[0];
    const cut = test.script.exec.indexOf(marker);
    if (cut !== -1) test.script.exec = test.script.exec.slice(0, cut);

    test.script.exec = test.script.exec.concat(STAMP);
    stamped++;
  }
}

walk(collection.item);

collection.info.description =
  collection.info.description.split('\n\n### Token renewal')[0] +
  '\n\n### Token renewal\n\n' +
  'Access tokens last 15 minutes. A collection pre-request script renews them ' +
  'automatically about a minute before expiry, the same way a frontend HTTP ' +
  'interceptor would — so you sign in once and keep working. Watch the Postman ' +
  'console for "Access token auto-refreshed".\n\n' +
  'Your session lasts as long as the refresh token: 7 days. After that, or if ' +
  'a refresh token gets replayed, sign in again from the Auth folder.';

fs.writeFileSync(FILE, JSON.stringify(collection, null, 2) + '\n');

console.log(`pre-request script installed (${PRE_REQUEST.length} lines)`);
console.log(`expiry stamp added to ${stamped} request(s)`);
