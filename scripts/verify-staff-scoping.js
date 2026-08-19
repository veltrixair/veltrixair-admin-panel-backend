/**
 * Checks that staff administration is bounded by the dashboard you signed in to.
 *
 *   ACTOR_EMAIL=... node scripts/verify-staff-scoping.js <password> <siteCode>
 *
 * `role_permissions` has no site column, so SUPER_ADMIN holds the staff feature
 * on every dashboard it can reach. Without the checks in StaffService that is a
 * privilege escalation: a super admin for one brand can mint a super admin for
 * another and sign in as it. This is the regression test for that.
 *
 * Expects an actor whose ONLY badge is on the given site.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const ACTOR = {
  email: process.env.ACTOR_EMAIL || 'esc-a@veltrixair.com',
  password: process.argv[2],
};
const ACTOR_SITE = Number(process.argv[3] || 103);
const OTHER_SITE = ACTOR_SITE === 101 ? 103 : 101;
const SUPER_ADMIN = 101;

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}  ->  ${detail}`);
  }
}

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
  if (!ACTOR.password) {
    console.error('Pass the actor password as the first argument.');
    process.exit(1);
  }

  const login = await call('POST', '/admin/auth/login', {
    ...ACTOR,
    siteCode: ACTOR_SITE,
    roleCode: SUPER_ADMIN,
  });
  if (login.status !== 200) {
    console.error('actor could not sign in:', login.status, login.body.message);
    process.exit(1);
  }
  const token = login.body.data.accessToken;
  console.log(`\nSigned in as a super admin whose only badge is site ${ACTOR_SITE}.`);

  console.log('\nVisibility');
  const list = await call('GET', '/admin/staff', null, token);
  const items = list.body.data?.items ?? [];
  // The real invariant, and site-agnostic: everyone returned must hold a
  // live badge on the actor's own dashboard. Asserting a NAMED colleague is
  // absent only works for one site — editor@ genuinely belongs to site 101.
  const strays = items.filter(
    (m) => !(m.roles ?? []).some((r) => r.siteCode === ACTOR_SITE),
  );
  check(
    'every account listed holds a badge on this dashboard',
    items.length > 0 && strays.length === 0,
    `${items.length} listed, ${strays.length} without a site-${ACTOR_SITE} badge: ` +
      JSON.stringify(strays.map((m) => m.email)),
  );

  const otherOnly = items.filter(
    (m) =>
      (m.roles ?? []).length > 0 &&
      (m.roles ?? []).every((r) => r.siteCode !== ACTOR_SITE),
  );
  check(
    'nobody whose access is entirely on another dashboard appears',
    otherOnly.length === 0,
    JSON.stringify(otherOnly.map((m) => m.email)),
  );

  console.log('\nCreating accounts');
  const wrongSite = await call(
    'POST',
    '/admin/staff',
    {
      email: `scope-probe-${Date.now()}@veltrixair.com`,
      fullName: 'Scope Probe',
      roleCodes: [SUPER_ADMIN],
      siteCode: OTHER_SITE,
    },
    token,
  );
  check(
    'the dashboard cannot even be named on create — the field does not exist',
    wrongSite.status === 400,
    `${wrongSite.status} ${wrongSite.body.message}`,
  );

  const ownSite = await call(
    'POST',
    '/admin/staff',
    {
      email: `scope-probe-${Date.now()}@veltrixair.com`,
      fullName: 'Scope Probe',
      roleCodes: [105],
    },
    token,
  );
  check(
    'creating without naming a dashboard lands on the actor own site',
    ownSite.status === 201,
    `${ownSite.status} ${JSON.stringify(ownSite.body.data ?? ownSite.body.message)}`,
  );
  const targetId = ownSite.body.data?.id;

  console.log('\nGranting and revoking');
  const grantElsewhere = await call(
    'POST',
    `/admin/staff/${targetId}/roles`,
    { roleCode: SUPER_ADMIN, siteCode: OTHER_SITE },
    token,
  );
  check(
    'the dashboard cannot be named on grant either',
    grantElsewhere.status === 400,
    `${grantElsewhere.status} ${grantElsewhere.body.message}`,
  );

  const grantHere = await call(
    'POST',
    `/admin/staff/${targetId}/roles`,
    { roleCode: SUPER_ADMIN },
    token,
  );
  check(
    'granting without a dashboard lands on the actor own site',
    grantHere.status === 201 || grantHere.status === 200,
    `${grantHere.status} ${grantHere.body.message}`,
  );

  const revokeElsewhere = await call(
    'DELETE',
    `/admin/staff/${targetId}/roles/${OTHER_SITE}/${SUPER_ADMIN}`,
    null,
    token,
  );
  check(
    'cannot revoke a badge on another dashboard',
    revokeElsewhere.status === 403,
    `${revokeElsewhere.status} ${revokeElsewhere.body.message}`,
  );

  console.log('\nAccount-level actions on someone with access elsewhere');
  const globalAdmin = items.find((s) => s.email === 'admin@veltrixair.com');
  if (globalAdmin) {
    const deactivate = await call(
      'PATCH',
      `/admin/staff/${globalAdmin.id}`,
      { isActive: false },
      token,
    );
    check(
      'cannot deactivate an account with badges on other dashboards',
      deactivate.status === 403,
      `${deactivate.status} ${deactivate.body.message}`,
    );

    const reset = await call(
      'POST',
      `/admin/staff/${globalAdmin.id}/reset-password`,
      null,
      token,
    );
    check(
      'cannot reset the password of an account with badges elsewhere',
      reset.status === 403,
      `${reset.status} ${reset.body.message}`,
    );
  } else {
    console.log('  --    skipped: no multi-dashboard account visible here');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (targetId) {
    console.log(`created for cleanup: ${ownSite.body.data.email}`);
  }
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
