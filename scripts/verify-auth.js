/**
 * End-to-end check of the auth module against a running server.
 *
 *   node scripts/verify-auth.js
 *
 * Kept as a script rather than a Jest test because it exercises the real
 * process: the throttler, the guards and the database, in the order a client
 * would hit them. Unit tests can't observe refresh-token rotation across
 * requests.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

// Emails are overridable so this can run against a throwaway super admin
// rather than needing the real one's password.
const SUPER = {
  email: process.env.SUPER_EMAIL || 'admin@veltrixair.com',
  password: process.argv[2],
};
const EDITOR = {
  email: process.env.EDITOR_EMAIL || 'editor@veltrixair.com',
  password: process.argv[3],
};

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, path, { body, token } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    /* empty body */
  }
  return { status: response.status, body: json };
}

(async () => {
  if (!SUPER.password || !EDITOR.password) {
    throw new Error(
      'Usage: node scripts/verify-auth.js <superAdminPassword> <editorPassword>',
    );
  }

  console.log('\n1. Login\n');

  const wrongPassword = await call('POST', '/admin/auth/login', {
    body: { email: SUPER.email, password: 'definitely-not-it' },
  });
  check('wrong password → 401', wrongPassword.status === 401, `got ${wrongPassword.status}`);

  const unknownEmail = await call('POST', '/admin/auth/login', {
    body: { email: 'nobody@veltrixair.com', password: 'definitely-not-it' },
  });
  check('unknown email → 401', unknownEmail.status === 401, `got ${unknownEmail.status}`);
  check(
    'unknown email and wrong password give the same message',
    unknownEmail.body?.message === wrongPassword.body?.message,
    `${unknownEmail.body?.message} vs ${wrongPassword.body?.message}`,
  );

  const login = await call('POST', '/admin/auth/login', { body: SUPER });
  check('correct password → 200', login.status === 200, `got ${login.status}`);

  const tokens = login.body?.data;
  check('returns an access token', typeof tokens?.accessToken === 'string');
  check('returns a refresh token', typeof tokens?.refreshToken === 'string');
  check(
    'refresh token is opaque, not a JWT',
    typeof tokens?.refreshToken === 'string' &&
      tokens.refreshToken.split('.').length !== 3,
  );

  console.log('\n2. Access control\n');

  const noToken = await call('GET', '/admin/contact/enquiries');
  check('no token → 401', noToken.status === 401, `got ${noToken.status}`);

  const badToken = await call('GET', '/admin/contact/enquiries', {
    token: 'not.a.token',
  });
  check('malformed token → 401', badToken.status === 401, `got ${badToken.status}`);

  const withToken = await call('GET', '/admin/contact/enquiries', {
    token: tokens.accessToken,
  });
  check('super admin reads enquiries → 200', withToken.status === 200, `got ${withToken.status}`);

  const me = await call('GET', '/admin/auth/me', { token: tokens.accessToken });
  check('GET /me → 200', me.status === 200, `got ${me.status}`);
  check(
    'me lists SUPER_ADMIN',
    me.body?.data?.roles?.some((r) => r.name === 'SUPER_ADMIN'),
  );
  check(
    'super admin holds all 24 permissions (6 features x 4 verbs)',
    me.body?.data?.permissions?.length === 24,
    `got ${me.body?.data?.permissions?.length}`,
  );
  check('me never returns a password hash', !JSON.stringify(me.body).includes('argon2'));

  console.log('\n3. Permission denial\n');

  const editorLogin = await call('POST', '/admin/auth/login', { body: EDITOR });
  check('editor logs in → 200', editorLogin.status === 200, `got ${editorLogin.status}`);
  const editorToken = editorLogin.body?.data?.accessToken;

  const editorReadsArticles = await call('GET', '/admin/insights/articles', {
    token: editorToken,
  });
  check(
    'editor reads articles → 200 (has INSIGHTS:VIEW)',
    editorReadsArticles.status === 200,
    `got ${editorReadsArticles.status}`,
  );

  const editorReadsEnquiries = await call('GET', '/admin/contact/enquiries', {
    token: editorToken,
  });
  check(
    'editor reads enquiries → 403 (no CONTACT:VIEW)',
    editorReadsEnquiries.status === 403,
    `got ${editorReadsEnquiries.status}`,
  );

  const editorCreatesJob = await call('POST', '/admin/careers/jobs', {
    token: editorToken,
    body: {},
  });
  check(
    'editor creates a job → 403 (has CAREERS:UPDATE, not CREATE)',
    editorCreatesJob.status === 403,
    `got ${editorCreatesJob.status}`,
  );

  const editorDeletesFile = await call(
    'DELETE',
    '/admin/files/00000000-0000-0000-0000-000000000000',
    { token: editorToken },
  );
  check(
    'editor deletes a file → 403 (has FILES:CREATE, not DELETE)',
    editorDeletesFile.status === 403,
    `got ${editorDeletesFile.status}`,
  );

  console.log('\n4. Refresh rotation\n');

  const firstRefresh = await call('POST', '/admin/auth/refresh', {
    body: { refreshToken: tokens.refreshToken },
  });
  check('refresh → 200', firstRefresh.status === 200, `got ${firstRefresh.status}`);

  const rotated = firstRefresh.body?.data;
  check(
    'refresh returns a DIFFERENT refresh token',
    rotated?.refreshToken && rotated.refreshToken !== tokens.refreshToken,
  );

  const rotatedWorks = await call('GET', '/admin/auth/me', {
    token: rotated.accessToken,
  });
  check('the new access token works', rotatedWorks.status === 200, `got ${rotatedWorks.status}`);

  console.log('\n5. Reuse detection\n');

  const replay = await call('POST', '/admin/auth/refresh', {
    body: { refreshToken: tokens.refreshToken },
  });
  check(
    'replaying the spent refresh token → 403',
    replay.status === 403,
    `got ${replay.status}`,
  );

  const successorAfterReuse = await call('POST', '/admin/auth/refresh', {
    body: { refreshToken: rotated.refreshToken },
  });
  check(
    'the whole family is revoked, so the successor also fails',
    successorAfterReuse.status === 403,
    `got ${successorAfterReuse.status}`,
  );

  const garbageRefresh = await call('POST', '/admin/auth/refresh', {
    body: { refreshToken: 'x'.repeat(64) },
  });
  check(
    'an unknown refresh token → 401, not 403',
    garbageRefresh.status === 401,
    `got ${garbageRefresh.status}`,
  );

  console.log('\n6. Logout\n');

  const fresh = await call('POST', '/admin/auth/login', { body: SUPER });
  const freshTokens = fresh.body?.data;

  const loggedOut = await call('POST', '/admin/auth/logout', {
    body: { refreshToken: freshTokens.refreshToken },
  });
  check('logout → 200', loggedOut.status === 200, `got ${loggedOut.status}`);
  check('logout revoked one token', loggedOut.body?.data?.revoked === 1, `got ${loggedOut.body?.data?.revoked}`);

  const refreshAfterLogout = await call('POST', '/admin/auth/refresh', {
    body: { refreshToken: freshTokens.refreshToken },
  });
  check(
    'refreshing after logout → 403',
    refreshAfterLogout.status === 403,
    `got ${refreshAfterLogout.status}`,
  );

  // The access token is still inside its 15-minute window. This is the known
  // trade-off of stateless access tokens and is why the TTL is short.
  const accessAfterLogout = await call('GET', '/admin/auth/me', {
    token: freshTokens.accessToken,
  });
  check(
    'access token still valid until it expires (documented trade-off)',
    accessAfterLogout.status === 200,
    `got ${accessAfterLogout.status}`,
  );

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
});
