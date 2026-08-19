/**
 * Checks that a unit admin runs their unit fully but cannot touch the root.
 *
 *   UNIT_EMAIL=... node scripts/verify-root-protection.js <password> <siteCode>
 *
 * Once a unit has its own super admin, the "never leave a unit without a super
 * admin" guard stops covering the root account: on that site both hold the same
 * badge, so nothing says one outranks the other. `is_protected` is that rank,
 * and this is the regression test for it.
 *
 * Expects an actor holding SUPER_ADMIN on the given site and nowhere else.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ACTOR = {
  email: process.env.UNIT_EMAIL,
  password: process.argv[2],
};
const SITE = Number(process.argv[3]);
const SUPER_ADMIN = 101;
const ROOT_EMAIL = process.env.ROOT_EMAIL || 'admin@veltrixair.com';

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}  ->  ${detail}`);
  }
};

const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
};

(async () => {
  if (!ACTOR.email || !ACTOR.password || !SITE) {
    console.error(
      'Usage: UNIT_EMAIL=... node scripts/verify-root-protection.js <password> <siteCode>',
    );
    process.exit(1);
  }

  const login = await call('POST', '/admin/auth/login', {
    ...ACTOR,
    siteCode: SITE,
    roleCode: SUPER_ADMIN,
  });
  if (login.status !== 200) {
    console.error('unit admin could not sign in:', login.status, login.body.message);
    process.exit(1);
  }
  const token = login.body.data.accessToken;
  console.log(`\nSigned in as the unit admin for site ${SITE}.`);

  const list = await call('GET', '/admin/staff', null, token);
  const root = (list.body.data?.items ?? []).find((s) => s.email === ROOT_EMAIL);

  check(
    'the root is still visible on their staff list',
    !!root,
    'root not found — hiding it was not the intent',
  );
  if (!root) {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
  }

  console.log('\nWhat the unit admin may NOT do to it');
  const revoke = await call(
    'DELETE',
    `/admin/staff/${root.id}/roles/${SITE}/${SUPER_ADMIN}`,
    null,
    token,
  );
  check(
    'cannot revoke the root badge on their own unit',
    revoke.status === 403,
    `${revoke.status} ${revoke.body.message}`,
  );

  const deactivate = await call(
    'PATCH',
    `/admin/staff/${root.id}`,
    { isActive: false },
    token,
  );
  check(
    'cannot deactivate the root',
    deactivate.status === 403,
    `${deactivate.status} ${deactivate.body.message}`,
  );

  const reset = await call(
    'POST',
    `/admin/staff/${root.id}/reset-password`,
    null,
    token,
  );
  check(
    'cannot reset the root password',
    reset.status === 403,
    `${reset.status} ${reset.body.message}`,
  );

  const replace = await call(
    'PUT',
    `/admin/staff/${root.id}/roles`,
    { roleCodes: [105] },
    token,
  );
  check(
    'cannot downgrade the root to a viewer',
    replace.status === 403,
    `${replace.status} ${replace.body.message}`,
  );

  console.log('\nWhat they still CAN do on their own unit');
  const created = await call(
    'POST',
    '/admin/staff',
    {
      email: `unit-probe-${Date.now()}@veltrixair.com`,
      fullName: 'Unit Probe',
      roleCodes: [105],
    },
    token,
  );
  check(
    'create a colleague on their unit',
    created.status === 201,
    `${created.status} ${JSON.stringify(created.body.data ?? created.body.message)}`,
  );

  if (created.status === 201) {
    const target = created.body.data.id;
    const granted = await call(
      'POST',
      `/admin/staff/${target}/roles`,
      { roleCode: 104 },
      token,
    );
    check(
      'grant them another role',
      granted.status === 201 || granted.status === 200,
      `${granted.status} ${granted.body.message}`,
    );

    const revoked = await call(
      'DELETE',
      `/admin/staff/${target}/roles/${SITE}/104`,
      null,
      token,
    );
    check(
      'and revoke it again',
      revoked.status === 200,
      `${revoked.status} ${revoked.body.message}`,
    );
    console.log(`\ncreated for cleanup: ${created.body.data.email}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
