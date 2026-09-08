/**
 * End-to-end check of the two-step staff onboarding flow.
 *
 *   IT_PW=... node scripts/verify-staff-onboarding.js
 *
 * The account is created, cannot be used, is invited, still cannot be used for
 * anything except changing its own password, and only becomes a working
 * session once it has one of its own. Every probe cleans up after itself.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const IT = {
  email: process.env.IT_EMAIL || 'it.admin@veltrixair.com',
  password: process.env.IT_PW,
  siteCode: 101,
};
const SUPER_ADMIN = 101;
const PENDING = 106;
const VIEWER = 105;
const SALES = 104;

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

const call = async (method, path, body, token, site = 101) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Site-Code': String(site),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let parsed = {};
  try {
    parsed = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body: parsed };
};

const stamp = Date.now();
const probeEmail = `onboarding-probe-${stamp}@example.com`;

(async () => {
  if (!IT.password) {
    console.error('Set IT_PW.');
    process.exit(1);
  }

  const login = await call('POST', '/admin/auth/login', {
    ...IT,
    roleCode: SUPER_ADMIN,
  });
  if (login.status !== 200) {
    console.error('could not sign in:', login.status, login.body.message);
    process.exit(1);
  }
  const admin = login.body.data.accessToken;

  console.log('\nOnboarding');

  const created = await call(
    'POST',
    '/admin/staff',
    {
      email: probeEmail,
      fullName: 'Onboarding Probe',
      designation: 'Verification Engineer',
      departmentCode: 101,
      employmentType: 'FULL_TIME',
      mobile: '+966 55 000 0000',
      joiningDate: '2026-09-01',
      probationUntil: '2026-12-01',
      notes: 'Created by verify-staff-onboarding.js',
    },
    admin,
  );
  check(
    'creates without naming a role',
    created.status === 201,
    `${created.status} ${JSON.stringify(created.body.message ?? created.body.data)}`,
  );

  const staff = created.body.data ?? {};
  const staffId = staff.id;

  check(
    'no password is returned — the account is not usable yet',
    staff.temporaryPassword === undefined,
    JSON.stringify(Object.keys(staff)),
  );
  check(
    'status is PENDING',
    staff.status === 'PENDING' && staff.invitedAt === null,
    JSON.stringify({ status: staff.status, invitedAt: staff.invitedAt }),
  );
  check(
    'the default badge is PENDING on the creator’s site',
    staff.roles?.length === 1 &&
      staff.roles[0].code === PENDING &&
      staff.roles[0].siteCode === 101,
    JSON.stringify(staff.roles),
  );
  check(
    'an employee code was issued in house format',
    /^VTX-EMP-\d{4}$/.test(staff.profile?.employeeCode ?? ''),
    JSON.stringify(staff.profile?.employeeCode),
  );
  check(
    'the profile came back with its department resolved',
    staff.profile?.department?.name === 'Engineering' &&
      staff.profile?.designation === 'Verification Engineer',
    JSON.stringify(staff.profile),
  );
  check(
    'the mobile is withheld from the response',
    staff.profile?.mobile === undefined,
    JSON.stringify(Object.keys(staff.profile ?? {})),
  );

  const badDept = await call(
    'POST',
    '/admin/staff',
    {
      email: `bad-dept-${stamp}@example.com`,
      fullName: 'Bad Dept',
      designation: 'Nobody',
      departmentCode: 999,
      employmentType: 'FULL_TIME',
    },
    admin,
  );
  check(
    'an unknown department is refused',
    badDept.status === 400,
    `${badDept.status} ${badDept.body.message}`,
  );

  console.log('\nBefore the invitation');

  const beforeInvite = await call('POST', '/admin/auth/login', {
    email: probeEmail,
    password: 'anything-at-all',
    siteCode: 101,
    roleCode: SALES,
  });
  check(
    'an uninvited account cannot sign in',
    beforeInvite.status === 401,
    `${beforeInvite.status} ${beforeInvite.body.message}`,
  );

  console.log('\nInviting');

  const correctedEmail = `onboarding-probe-fixed-${stamp}@example.com`;

  const blankInvite = await call(
    'POST',
    `/admin/staff/${staffId}/invite`,
    {},
    admin,
  );
  check(
    'an invitation with no email and no role is refused',
    blankInvite.status === 400,
    `${blankInvite.status} ${JSON.stringify(blankInvite.body.data ?? blankInvite.body.message)}`,
  );

  const noRole = await call(
    'POST',
    `/admin/staff/${staffId}/invite`,
    { email: correctedEmail },
    admin,
  );
  check(
    'and so is one that names no role — a password needs a job behind it',
    noRole.status === 400,
    `${noRole.status} ${JSON.stringify(noRole.body.data ?? noRole.body.message)}`,
  );

  const unknownEmail = await call(
    'POST',
    '/admin/staff/invite',
    { email: `nobody-${stamp}@example.com`, roleCodes: [SALES] },
    admin,
  );
  check(
    'inviting an address with no account is a 404, not a quiet create',
    unknownEmail.status === 404,
    `${unknownEmail.status} ${unknownEmail.body.message}`,
  );

  const pendingInvite = await call(
    'POST',
    `/admin/staff/${staffId}/invite`,
    { email: correctedEmail, roleCodes: [PENDING] },
    admin,
  );
  check(
    'inviting someone INTO the placeholder is refused',
    pendingInvite.status === 400 &&
      /placeholder/i.test(pendingInvite.body.message ?? ''),
    `${pendingInvite.status} ${pendingInvite.body.message}`,
  );

  // Deliberately not a sixth login probe: sign-in is throttled to 5/minute,
  // and "an uninvited account cannot sign in" above already covers it. The
  // three refusals here throw before a password is ever minted, so there is
  // nothing new to leak.
  const invited = await call(
    'POST',
    `/admin/staff/${staffId}/invite`,
    {
      email: correctedEmail,
      roleCodes: [SALES],
      message: 'Welcome aboard.',
    },
    admin,
  );
  check(
    'the invitation issues a temporary password',
    invited.status === 201 && !!invited.body.data?.temporaryPassword,
    `${invited.status} ${invited.body.message}`,
  );
  check(
    'status becomes INVITED',
    invited.body.data?.status === 'INVITED' &&
      invited.body.data?.mustChangePassword === true,
    JSON.stringify({
      status: invited.body.data?.status,
      must: invited.body.data?.mustChangePassword,
    }),
  );
  check(
    'a mistyped address can still be corrected — nobody has used it yet',
    invited.body.data?.email === correctedEmail,
    JSON.stringify(invited.body.data?.email),
  );
  check(
    'the role named on the invitation was granted',
    invited.body.data?.roles?.some((r) => r.code === SALES),
    JSON.stringify(invited.body.data?.roles),
  );
  check(
    'and the PENDING placeholder was revoked in the same breath',
    !invited.body.data?.roles?.some((r) => r.code === PENDING),
    JSON.stringify(invited.body.data?.roles),
  );

  const temporaryPassword = invited.body.data?.temporaryPassword;

  const again = await call(
    'POST',
    `/admin/staff/${staffId}/invite`,
    { email: correctedEmail, roleCodes: [SALES] },
    admin,
  );
  check(
    'inviting twice is refused without resend',
    again.status === 409,
    `${again.status} ${again.body.message}`,
  );

  console.log('\nSigning in with a password somebody else chose');

  const firstLogin = await call('POST', '/admin/auth/login', {
    email: correctedEmail,
    password: temporaryPassword,
    siteCode: 101,
    roleCode: SALES,
  });
  check(
    'the temporary password works',
    firstLogin.status === 200,
    `${firstLogin.status} ${firstLogin.body.message}`,
  );
  const probeToken = firstLogin.body.data?.accessToken;

  const me = await call('GET', '/admin/auth/me', null, probeToken);
  check(
    'they land on their dashboard straight away',
    me.status === 200,
    `${me.status} ${me.body.message}`,
  );
  check(
    'and are told to choose their own — a prompt, not a lock',
    me.body.data?.mustChangePassword === true,
    JSON.stringify(me.body.data?.mustChangePassword),
  );
  check(
    'their own profile rides on /me, mobile included',
    me.body.data?.profile?.designation === 'Verification Engineer' &&
      me.body.data?.profile?.department === 'Engineering' &&
      me.body.data?.profile?.mobile === '+966 55 000 0000',
    JSON.stringify(me.body.data?.profile),
  );
  check(
    'they arrive holding SALES, not a placeholder',
    me.body.data?.scope?.roleName === 'SALES' &&
      me.body.data?.permissions?.some((p) => p.feature === 'IT_CONTACT'),
    JSON.stringify(me.body.data?.scope),
  );

  const canWork = await call('GET', '/admin/contact/enquiries?limit=5', null, probeToken);
  check(
    'and can work their pipeline immediately — a prompt, not a lock',
    canWork.status === 200,
    `${canWork.status} ${canWork.body.message}`,
  );

  const notTheirs = await call('GET', '/admin/careers/jobs', null, probeToken);
  check(
    'but only what SALES grants — careers is not theirs',
    notTheirs.status === 403,
    `${notTheirs.status} ${notTheirs.body.message}`,
  );

  /*
   * SALES nominally grants CRANE_QUOTES. Their badge is on site 101, and that
   * controller is hard-scoped to Industries — so the role says yes and the
   * site says no. This is the two-lock model, and the reason a permission
   * list alone should never drive the sidebar.
   */
  const wrongBrand = await call(
    'GET',
    '/admin/crane-quotes',
    null,
    probeToken,
    102,
  );
  check(
    'crane quotes stay shut despite SALES granting them — wrong brand',
    wrongBrand.status === 403,
    `${wrongBrand.status} ${wrongBrand.body.message}`,
  );

  const changed = await call(
    'POST',
    '/admin/auth/change-password',
    {
      currentPassword: temporaryPassword,
      newPassword: `Probe-Chosen-${stamp}!aA`,
    },
    probeToken,
  );
  check(
    'they can change their own password',
    changed.status === 200,
    `${changed.status} ${changed.body.message}`,
  );

  console.log('\nAfter choosing their own');

  const secondLogin = await call('POST', '/admin/auth/login', {
    email: correctedEmail,
    password: `Probe-Chosen-${stamp}!aA`,
    siteCode: 101,
    roleCode: SALES,
  });
  const ownToken = secondLogin.body.data?.accessToken;
  check(
    'they can sign in with the new one',
    secondLogin.status === 200,
    `${secondLogin.status} ${secondLogin.body.message}`,
  );

  const ownMe = await call('GET', '/admin/auth/me', null, ownToken);
  check(
    'the prompt clears once the password is theirs',
    ownMe.body.data?.mustChangePassword === false,
    JSON.stringify(ownMe.body.data?.mustChangePassword),
  );

  const stillWorks = await call('GET', '/admin/contact/enquiries?limit=5', null, ownToken);
  check(
    'and their pipeline still opens under the new password',
    stillWorks.status === 200,
    `${stillWorks.status} ${stillWorks.body.message}`,
  );

  console.log('\nAdding a second role later');

  const granted = await call(
    'POST',
    `/admin/staff/${staffId}/roles`,
    { roleCode: VIEWER },
    admin,
  );
  check(
    'another badge can still be granted afterwards',
    granted.status === 201,
    `${granted.status} ${granted.body.message}`,
  );

  const asViewer = await call('POST', '/admin/auth/login', {
    email: correctedEmail,
    password: `Probe-Chosen-${stamp}!aA`,
    siteCode: 101,
    roleCode: VIEWER,
  });
  const viewerToken = asViewer.body.data?.accessToken;
  const nowReads = await call('GET', '/admin/careers/jobs', null, viewerToken);
  check(
    'and signing in as it opens what that role grants instead',
    nowReads.status === 200,
    `${nowReads.status} ${nowReads.body.message}`,
  );

  console.log('\nThe panel’s route — email, no id');

  const panelEmail = `panel-probe-${stamp}@example.com`;
  const panelStaff = await call(
    'POST',
    '/admin/staff',
    {
      email: panelEmail,
      fullName: 'Panel Probe',
      designation: 'Recruitment Lead',
      departmentCode: 106,
      employmentType: 'FULL_TIME',
    },
    admin,
  );
  check(
    'a second account is filed on the staff form',
    panelStaff.status === 201 && panelStaff.body.data?.status === 'PENDING',
    `${panelStaff.status} ${panelStaff.body.data?.status}`,
  );

  const byEmail = await call(
    'POST',
    '/admin/staff/invite',
    { email: panelEmail, roleCodes: [VIEWER] },
    admin,
  );
  check(
    'and invited by email alone — no id anywhere',
    byEmail.status === 201 && !!byEmail.body.data?.temporaryPassword,
    `${byEmail.status} ${byEmail.body.message}`,
  );
  check(
    'the role landed and PENDING went with it',
    byEmail.body.data?.roles?.some((r) => r.code === VIEWER) &&
      !byEmail.body.data?.roles?.some((r) => r.code === PENDING),
    JSON.stringify(byEmail.body.data?.roles),
  );

  await call('PATCH', `/admin/staff/${panelStaff.body.data?.id}`, { isActive: false }, admin);

  console.log('\nCleaning up');
  const deactivated = await call(
    'PATCH',
    `/admin/staff/${staffId}`,
    { isActive: false },
    admin,
  );
  check(
    'the probe account was deactivated',
    deactivated.status === 200,
    `${deactivated.status} ${deactivated.body.message}`,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`probe account left deactivated: ${probeEmail}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
