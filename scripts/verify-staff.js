/**
 * End-to-end check of the staff module against a running server.
 *
 *   node scripts/verify-staff.js <superAdminPassword> <editorPassword>
 *
 * Creates its own throwaway accounts and deletes them at the end, so it can be
 * run repeatedly without leaving residue.
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

const ROLE = {
  SUPER_ADMIN: 101,
  CONTENT_EDITOR: 102,
  RECRUITER: 103,
  SALES: 104,
  VIEWER: 105,
};

let passed = 0;
let failed = 0;
const createdEmails = [];

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Login is throttled to 5 attempts per minute per IP, and this script needs
 * more than that. Waiting out the window is the honest way through — turning
 * the limit off for the test would mean not testing the thing that ships.
 */
async function attemptLogin(credentials) {
  let result = await call('POST', '/admin/auth/login', { body: credentials });
  if (result.status === 429) {
    console.log('        (login throttle hit — waiting 61s)');
    await sleep(61_000);
    result = await call('POST', '/admin/auth/login', { body: credentials });
  }
  return result;
}

async function login(credentials) {
  const result = await attemptLogin(credentials);
  if (result.status !== 200) {
    throw new Error(
      `Could not sign in as ${credentials.email}: ${result.status} ${JSON.stringify(result.body)}`,
    );
  }
  return result.body.data.accessToken;
}

/** Removes the accounts this run created, so it can be run again. */
async function cleanup() {
  if (createdEmails.length === 0) return;
  require('dotenv').config({ path: 'config/dev.env' });
  const { Client } = require('pg');
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  const result = await client.query(
    'DELETE FROM admins WHERE email = ANY($1::text[])',
    [createdEmails],
  );
  await client.end();
  console.log(`\n  cleaned up ${result.rowCount} test account(s)`);
}

(async () => {
  if (!SUPER.password || !EDITOR.password) {
    throw new Error(
      'Usage: node scripts/verify-staff.js <superAdminPassword> <editorPassword>',
    );
  }

  const superToken = await login(SUPER);
  const editorToken = await login(EDITOR);

  console.log('\n1. Only SUPER_ADMIN reaches this surface\n');

  const editorList = await call('GET', '/admin/staff', { token: editorToken });
  check(
    'content editor lists staff → 403',
    editorList.status === 403,
    `got ${editorList.status}`,
  );

  const anonList = await call('GET', '/admin/staff');
  check('no token → 401', anonList.status === 401, `got ${anonList.status}`);

  const superList = await call('GET', '/admin/staff', { token: superToken });
  check('super admin lists staff → 200', superList.status === 200, `got ${superList.status}`);
  check(
    'listing includes live roles',
    superList.body?.data?.items?.[0]?.roles?.length > 0,
  );

  // Regression: implicit conversion turned the string "false" into true, so
  // this filter used to return ACTIVE accounts.
  const activeOnly = await call('GET', '/admin/staff?isActive=true', { token: superToken });
  const inactiveOnly = await call('GET', '/admin/staff?isActive=false', { token: superToken });
  check(
    '?isActive=true returns only active accounts',
    (activeOnly.body?.data?.items ?? []).every((s) => s.isActive === true),
  );
  check(
    '?isActive=false returns only inactive accounts',
    (inactiveOnly.body?.data?.items ?? []).every((s) => s.isActive === false),
    `got ${JSON.stringify((inactiveOnly.body?.data?.items ?? []).map((s) => s.isActive))}`,
  );

  console.log('\n2. The matrix is readable, not writable\n');

  const roles = await call('GET', '/admin/staff/roles', { token: superToken });
  check('roles endpoint → 200', roles.status === 200, `got ${roles.status}`);
  check('returns all 5 roles', roles.body?.data?.length === 5, `got ${roles.body?.data?.length}`);

  const superRole = roles.body?.data?.find((r) => r.code === ROLE.SUPER_ADMIN);
  check(
    'SUPER_ADMIN now covers 6 features x 4 verbs = 24',
    superRole?.permissions?.length === 24,
    `got ${superRole?.permissions?.length}`,
  );

  const viewerRole = roles.body?.data?.find((r) => r.code === ROLE.VIEWER);
  check(
    'VIEWER has no ADMINS permission',
    !viewerRole?.permissions?.some((p) => p.featureCode === 106),
  );

  console.log('\n3. Create an account\n');

  const newEmail = `verify-staff-${Date.now()}@veltrixair.com`;
  const created = await call('POST', '/admin/staff', {
    token: superToken,
    body: {
      email: newEmail,
      fullName: 'Verification Test User',
      roleCodes: [ROLE.RECRUITER],
    },
  });
  check('create → 201', created.status === 201, `got ${created.status}`);
  createdEmails.push(newEmail);

  const staffId = created.body?.data?.id;
  const tempPassword = created.body?.data?.temporaryPassword;
  check('returns a temporary password', typeof tempPassword === 'string' && tempPassword.length > 20);
  check(
    'assigned the requested role',
    created.body?.data?.roles?.[0]?.name === 'RECRUITER',
    JSON.stringify(created.body?.data?.roles),
  );

  const duplicate = await call('POST', '/admin/staff', {
    token: superToken,
    body: { email: newEmail, fullName: 'Duplicate', roleCodes: [ROLE.VIEWER] },
  });
  check('duplicate email → 409', duplicate.status === 409, `got ${duplicate.status}`);

  const badRole = await call('POST', '/admin/staff', {
    token: superToken,
    body: {
      email: `bad-role-${Date.now()}@veltrixair.com`,
      fullName: 'Bad Role',
      roleCodes: [999],
    },
  });
  check('unknown role code → 400', badRole.status === 400, `got ${badRole.status}`);

  const noRole = await call('POST', '/admin/staff', {
    token: superToken,
    body: {
      email: `no-role-${Date.now()}@veltrixair.com`,
      fullName: 'No Role',
      roleCodes: [],
    },
  });
  check('empty role list → 400', noRole.status === 400, `got ${noRole.status}`);

  console.log('\n4. The new account actually works\n');

  const newLogin = await attemptLogin({ email: newEmail, password: tempPassword });
  check(
    'signs in with the temporary password → 200',
    newLogin.status === 200,
    `got ${newLogin.status}`,
  );
  const newToken = newLogin.body?.data?.accessToken;

  const newReadsJobs = await call('GET', '/admin/careers/jobs', { token: newToken });
  check(
    'recruiter reads jobs → 200',
    newReadsJobs.status === 200,
    `got ${newReadsJobs.status}`,
  );

  const newReadsArticles = await call('GET', '/admin/insights/articles', {
    token: newToken,
  });
  check(
    'recruiter reads articles → 403',
    newReadsArticles.status === 403,
    `got ${newReadsArticles.status}`,
  );

  console.log('\n5. Grant and revoke\n');

  const granted = await call('POST', `/admin/staff/${staffId}/roles`, {
    token: superToken,
    body: { roleCode: ROLE.CONTENT_EDITOR },
  });
  check('grant a second role → 201', granted.status === 201, `got ${granted.status}`);
  check('now holds 2 roles', granted.body?.data?.roles?.length === 2, `got ${granted.body?.data?.roles?.length}`);

  const grantAgain = await call('POST', `/admin/staff/${staffId}/roles`, {
    token: superToken,
    body: { roleCode: ROLE.CONTENT_EDITOR },
  });
  check(
    'granting the same role again is a no-op, not an error',
    grantAgain.status === 201 && grantAgain.body?.data?.roles?.length === 2,
    `got ${grantAgain.status}, ${grantAgain.body?.data?.roles?.length} roles`,
  );

  // The new role must take effect on the NEXT request, not the next login.
  const nowReadsArticles = await call('GET', '/admin/insights/articles', {
    token: newToken,
  });
  check(
    'the new role applies to the existing token immediately',
    nowReadsArticles.status === 200,
    `got ${nowReadsArticles.status}`,
  );

  const revoked = await call(
    'DELETE',
    `/admin/staff/${staffId}/roles/${ROLE.CONTENT_EDITOR}`,
    { token: superToken },
  );
  check('revoke → 200', revoked.status === 200, `got ${revoked.status}`);
  check('back to 1 role', revoked.body?.data?.roles?.length === 1, `got ${revoked.body?.data?.roles?.length}`);

  const afterRevoke = await call('GET', '/admin/insights/articles', {
    token: newToken,
  });
  check(
    'revocation takes effect immediately → 403',
    afterRevoke.status === 403,
    `got ${afterRevoke.status}`,
  );

  const revokeLast = await call(
    'DELETE',
    `/admin/staff/${staffId}/roles/${ROLE.RECRUITER}`,
    { token: superToken },
  );
  check(
    'cannot revoke the only remaining role → 409',
    revokeLast.status === 409,
    `got ${revokeLast.status}`,
  );

  console.log('\n6. Replace the whole set\n');

  const replaced = await call('PUT', `/admin/staff/${staffId}/roles`, {
    token: superToken,
    body: { roleCodes: [ROLE.SALES, ROLE.VIEWER] },
  });
  check('replace → 200', replaced.status === 200, `got ${replaced.status}`);
  check(
    'holds exactly SALES and VIEWER',
    JSON.stringify(replaced.body?.data?.roles?.map((r) => r.code)) ===
      JSON.stringify([ROLE.SALES, ROLE.VIEWER]),
    JSON.stringify(replaced.body?.data?.roles?.map((r) => r.code)),
  );

  const history = await call('GET', `/admin/staff/${staffId}/role-history`, {
    token: superToken,
  });
  check(
    'history keeps revoked assignments',
    history.body?.data?.some((r) => r.revokedAt !== null),
  );
  check(
    'history records who revoked',
    history.body?.data?.some((r) => r.revokedBy !== null),
  );

  console.log('\n7. Guard rails\n');

  const meRoles = await call('GET', '/admin/auth/me', { token: superToken });
  const selfId = meRoles.body?.data?.id;

  const selfGrant = await call('POST', `/admin/staff/${selfId}/roles`, {
    token: superToken,
    body: { roleCode: ROLE.VIEWER },
  });
  check(
    'cannot change your own roles → 403',
    selfGrant.status === 403,
    `got ${selfGrant.status}`,
  );

  const selfDeactivate = await call('PATCH', `/admin/staff/${selfId}`, {
    token: superToken,
    body: { isActive: false },
  });
  check(
    'cannot deactivate yourself → 403',
    selfDeactivate.status === 403,
    `got ${selfDeactivate.status}`,
  );

  // Promote the test account to super admin, then confirm the guard protects
  // whichever one would be last.
  await call('PUT', `/admin/staff/${staffId}/roles`, {
    token: superToken,
    body: { roleCodes: [ROLE.SUPER_ADMIN] },
  });

  const demoteWhileTwoExist = await call('PUT', `/admin/staff/${staffId}/roles`, {
    token: superToken,
    body: { roleCodes: [ROLE.VIEWER] },
  });
  check(
    'demoting a super admin is allowed while another exists → 200',
    demoteWhileTwoExist.status === 200,
    `got ${demoteWhileTwoExist.status}`,
  );

  console.log('\n8. Deactivation ends sessions\n');

  const targetLogin = await attemptLogin({ email: newEmail, password: tempPassword });
  const targetTokens = targetLogin.body?.data;

  const deactivated = await call('PATCH', `/admin/staff/${staffId}`, {
    token: superToken,
    body: { isActive: false },
  });
  check('deactivate → 200', deactivated.status === 200, `got ${deactivated.status}`);
  check('reports inactive', deactivated.body?.data?.isActive === false);

  const refreshAfterDeactivate = await call('POST', '/admin/auth/refresh', {
    body: { refreshToken: targetTokens.refreshToken },
  });
  check(
    'their refresh token is dead → 401/403',
    [401, 403].includes(refreshAfterDeactivate.status),
    `got ${refreshAfterDeactivate.status}`,
  );

  const loginAfterDeactivate = await attemptLogin({ email: newEmail, password: tempPassword });
  check(
    'cannot sign in while deactivated → 401',
    loginAfterDeactivate.status === 401,
    `got ${loginAfterDeactivate.status}`,
  );

  console.log('\n9. Password reset\n');

  await call('PATCH', `/admin/staff/${staffId}`, {
    token: superToken,
    body: { isActive: true },
  });

  const reset = await call('POST', `/admin/staff/${staffId}/reset-password`, {
    token: superToken,
  });
  check('reset → 201', reset.status === 201, `got ${reset.status}`);

  const newPassword = reset.body?.data?.temporaryPassword;
  check(
    'issues a different password',
    typeof newPassword === 'string' && newPassword !== tempPassword,
  );

  const oldPasswordLogin = await attemptLogin({ email: newEmail, password: tempPassword });
  check(
    'the old password stops working → 401',
    oldPasswordLogin.status === 401,
    `got ${oldPasswordLogin.status}`,
  );

  const newPasswordLogin = await attemptLogin({ email: newEmail, password: newPassword });
  check(
    'the new password works → 200',
    newPasswordLogin.status === 200,
    `got ${newPasswordLogin.status}`,
  );

  await cleanup();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
});
