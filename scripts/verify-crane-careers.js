/**
 * End-to-end check of the crane careers module.
 *
 *   CRANE_EMAIL=... node scripts/verify-crane-careers.js <password>
 *
 * Covers the two things that make crane careers its own module rather than IT
 * careers with different data: a form that asks for nationality and residency,
 * and a pipeline whose deadlines the public page publishes. Plus the feature
 * split — 111 governs adverts, 112 governs candidates — which is the reason a
 * crane application can be handled without exposing who applied.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ACTOR = {
  email: process.env.CRANE_EMAIL || 'crane.admin@veltrixair.com',
  password: process.argv[2],
};
const CRANE_SITE = 102;
const SUPER_ADMIN = 101;

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
      'X-Site-Code': String(CRANE_SITE),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
};

const stamp = Date.now();

(async () => {
  if (!ACTOR.password) {
    console.error('Pass the crane admin password as the first argument.');
    process.exit(1);
  }

  const login = await call('POST', '/admin/auth/login', {
    ...ACTOR,
    siteCode: CRANE_SITE,
    roleCode: SUPER_ADMIN,
  });
  if (login.status !== 200) {
    console.error('could not sign in:', login.status, login.body.message);
    process.exit(1);
  }
  const token = login.body.data.accessToken;

  console.log('\nThe form options');
  const options = await call('GET', '/crane/careers/options');
  const o = options.body.data ?? {};
  check(
    'six career tracks, including "keep on file"',
    o.tracks?.length === 6 &&
      o.tracks.some((t) => t.label.includes('General application')),
    JSON.stringify(o.tracks?.map((t) => t.code)),
  );
  check(
    'experience is bands, not a number of years',
    o.experienceBands?.length === 6 &&
      o.experienceBands.some((b) => b.label === '15+ years'),
    JSON.stringify(o.experienceBands?.map((b) => b.label)),
  );
  check(
    'KSA residency statuses are offered',
    o.residencyStatuses?.length === 6 &&
      o.residencyStatuses.some((r) => r.label.includes('Iqama — transferable')),
    JSON.stringify(o.residencyStatuses?.map((r) => r.label)),
  );
  check(
    'qualifications include the trades',
    o.qualifications?.some((q) => q.label.includes('Diploma / ITI')),
    JSON.stringify(o.qualifications?.map((q) => q.label)),
  );

  console.log('\nA posting');
  const created = await call(
    'POST',
    '/admin/crane-careers/jobs',
    {
      refCode: `VTX-VER-${stamp % 100000}`,
      slug: `verify-installation-engineer-${stamp}`,
      title: 'Senior Installation Engineer',
      trackCode: 201,
      serviceLineCode: 101,
      locationCode: 201,
      employmentTypeCode: 201,
      experienceBandCode: 203,
      certifications: ['ISO 9927'],
      saudiNationalsOnly: false,
      status: 'OPEN',
    },
    token,
  );
  check(
    'creates with a service line and certifications',
    created.status === 201,
    `${created.status} ${JSON.stringify(created.body.data ?? created.body.message)}`,
  );
  const job = created.body.data;

  const badCode = await call(
    'POST',
    '/admin/crane-careers/jobs',
    {
      refCode: `VTX-BAD-${stamp % 100000}`,
      slug: `verify-bad-${stamp}`,
      title: 'Bad',
      trackCode: 999,
      locationCode: 201,
      employmentTypeCode: 201,
    },
    token,
  );
  check(
    'an unknown track code is refused',
    badCode.status === 400,
    `${badCode.status} ${JSON.stringify(badCode.body.data ?? badCode.body.message)}`,
  );

  const publicJob = await call('GET', `/crane/careers/jobs/${job.slug}`);
  check(
    'the advert shows its VTX-CRN discipline',
    publicJob.body.data?.serviceLine?.publicCode === 'VTX-CRN-01',
    JSON.stringify(publicJob.body.data?.serviceLine),
  );

  console.log('\nAn application');
  const applied = await call('POST', '/crane/careers/apply', {
    trackCode: 201,
    jobId: job.id,
    experienceBandCode: 203,
    availabilityCode: 202,
    fullName: 'Verification Probe',
    nationality: 'Indian',
    email: `cc-${stamp}@example.com`,
    mobile: '+966 55 000 0000',
    currentLocation: 'Riyadh',
    residencyCode: 203,
    qualificationCode: 201,
    workingLanguages: ['EN', 'HI'],
    certifications: 'NDT Level II',
    backgroundSummary:
      'Twelve years on tower and gantry installations across the Eastern Province.',
  });
  check(
    'submits with no CV and returns a VTX-HR reference',
    applied.status === 201 && /^VTX-HR-/.test(applied.body.data?.referenceNo),
    `${applied.status} ${JSON.stringify(applied.body.data ?? applied.body.message)}`,
  );
  check(
    'the reply tells the candidate to send their CV by email',
    /reply to the acknowledgement/i.test(applied.body.data?.message ?? ''),
    applied.body.data?.message,
  );

  const again = await call('POST', '/crane/careers/apply', {
    trackCode: 201,
    jobId: job.id,
    experienceBandCode: 203,
    fullName: 'Verification Probe',
    nationality: 'Indian',
    email: `cc-${stamp}@example.com`,
    mobile: '+966 55 000 0000',
    residencyCode: 203,
    qualificationCode: 201,
    workingLanguages: ['EN'],
    backgroundSummary:
      'Twelve years on tower and gantry installations across the Eastern Province.',
  });
  check(
    'a second live application for the same role is refused',
    again.status === 409,
    `${again.status} ${again.body.message}`,
  );

  console.log('\nWhat the pipeline exposes');
  const list = await call('GET', '/admin/crane-applications', null, token);
  const row = (list.body.data?.items ?? [])[0];
  check(
    'the list withholds nationality, mobile and background',
    row &&
      row.nationality === undefined &&
      row.mobile === undefined &&
      row.backgroundSummary === undefined,
    JSON.stringify(Object.keys(row ?? {})),
  );
  check(
    'awaitingCv finds the applications with no CV yet',
    (
      await call('GET', '/admin/crane-applications?awaitingCv=true', null, token)
    ).body.data?.items?.length > 0,
    'none returned',
  );

  const detail = await call(
    'GET',
    `/admin/crane-applications/${row.id}`,
    null,
    token,
  );
  const d = detail.body.data ?? {};
  check(
    'the detail record returns them',
    d.nationality === 'Indian' && typeof d.backgroundSummary === 'string',
    JSON.stringify({ nationality: d.nationality, mobile: d.mobile }),
  );
  check(
    'retention is set twelve months out',
    d.retentionUntil &&
      new Date(d.retentionUntil).getFullYear() -
        new Date(d.createdDate).getFullYear() ===
        1,
    JSON.stringify({ created: d.createdDate, retention: d.retentionUntil }),
  );

  console.log('\nThe published stage clocks');
  const screening = await call(
    'PATCH',
    `/admin/crane-applications/${row.id}/status`,
    { status: 'SCREENING', note: 'CV received by email.' },
    token,
  );
  const dueScreening = screening.body.data?.stageDueAt;
  check(
    'screening is due five working days out',
    !!dueScreening,
    JSON.stringify({ stageDueAt: dueScreening }),
  );

  const technical = await call(
    'PATCH',
    `/admin/crane-applications/${row.id}/status`,
    { status: 'TECHNICAL_INTERVIEW' },
    token,
  );
  check(
    'the technical stage is due later than screening was',
    new Date(technical.body.data?.stageDueAt) > new Date(dueScreening),
    JSON.stringify({
      screening: dueScreening,
      technical: technical.body.data?.stageDueAt,
    }),
  );

  const hired = await call(
    'PATCH',
    `/admin/crane-applications/${row.id}/status`,
    { status: 'HIRED' },
    token,
  );
  check(
    'a terminal stage carries no deadline',
    hired.body.data?.stageDueAt === null,
    JSON.stringify({ stageDueAt: hired.body.data?.stageDueAt }),
  );

  console.log('\nSeparation');
  const itLogin = await call('POST', '/admin/auth/login', {
    ...ACTOR,
    siteCode: 101,
    roleCode: SUPER_ADMIN,
  });
  check(
    'the crane admin cannot sign in to the IT dashboard',
    itLogin.status === 403,
    `${itLogin.status} ${itLogin.body.message}`,
  );

  const itJobs = await call('GET', '/admin/careers/jobs', null, token);
  check(
    'and is told IT postings belong to another dashboard',
    itJobs.status === 403,
    `${itJobs.status} ${itJobs.body.message}`,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`created for cleanup: ${job?.slug}, ${applied.body.data?.referenceNo}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
