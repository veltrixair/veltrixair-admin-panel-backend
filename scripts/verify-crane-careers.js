/**
 * End-to-end check of the crane careers module.
 *
 *   CRANE_EMAIL=... node scripts/verify-crane-careers.js <password>
 *
 * Covers what makes crane careers its own module rather than IT careers with
 * different data: a form asking for nationality and residency, a pipeline whose
 * deadlines the public page publishes, and uploads that accept photographs
 * because a rigging ticket is a plastic card. Plus the feature split — 111
 * governs adverts, 112 governs candidates.
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

/** Smallest byte sequences that satisfy the magic-byte check for each type. */
const pdf = () =>
  new Blob(['%PDF-1.4\ntrailer<</Root 1 0 R>>\n%%EOF\n'], {
    type: 'application/pdf',
  });
const jpeg = () =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])], {
    type: 'image/jpeg',
  });
const png = () =>
  new Blob(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])],
    { type: 'image/png' },
  );

/** The apply form is multipart now — the CV travels with it. */
const apply = async (fields, files = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => form.append(key, String(v)));
    else form.append(key, String(value));
  }
  if (files.resume !== null) {
    form.append('resume', files.resume ?? pdf(), 'cv.pdf');
  }
  (files.certificates ?? []).forEach((c, i) =>
    form.append('certificates', c.blob, c.name ?? `cert-${i}.pdf`),
  );

  const res = await fetch(`${BASE}/crane/careers/apply`, {
    method: 'POST',
    headers: { 'X-Site-Code': String(CRANE_SITE) },
    body: form,
  });
  return { status: res.status, body: await res.json() };
};

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
      o.residencyStatuses.some((r) => r.label.includes('Iqama')),
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

  console.log('\nApplying, with uploads');
  const baseFields = {
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
  };

  const noCv = await apply(baseFields, { resume: null });
  check(
    'a submission with no CV is refused',
    noCv.status === 400 && /resume/i.test(noCv.body.message ?? ''),
    `${noCv.status} ${noCv.body.message}`,
  );

  const tooMany = await apply(
    { ...baseFields, email: `cc-many-${stamp}@example.com` },
    {
      certificates: [
        { blob: pdf() },
        { blob: pdf() },
        { blob: pdf() },
        { blob: pdf() },
        { blob: pdf() },
      ],
    },
  );
  check(
    'a fifth certificate is refused',
    tooMany.status === 400,
    `${tooMany.status} ${tooMany.body.message}`,
  );

  const applied = await apply(baseFields, {
    certificates: [
      { blob: pdf(), name: 'iso-9927.pdf' },
      { blob: jpeg(), name: 'ndt-card.jpg' },
      { blob: png(), name: 'rigging-ticket.png' },
    ],
  });
  check(
    'submits with a CV and three certificates',
    applied.status === 201 && /^VTX-HR-/.test(applied.body.data?.referenceNo),
    `${applied.status} ${JSON.stringify(applied.body.data ?? applied.body.message)}`,
  );
  check(
    'the reply no longer asks for a CV by email',
    !/reply to the acknowledgement/i.test(applied.body.data?.message ?? ''),
    applied.body.data?.message,
  );

  const again = await apply(baseFields);
  check(
    'a second live application for the same role is refused',
    again.status === 409,
    `${again.status} ${again.body.message}`,
  );

  console.log('\nWhat the pipeline exposes');
  const list = await call('GET', '/admin/crane-applications', null, token);
  const row = (list.body.data?.items ?? []).find(
    (a) => a.referenceNo === applied.body.data.referenceNo,
  );
  check(
    'the list withholds nationality, mobile and background',
    row &&
      row.nationality === undefined &&
      row.mobile === undefined &&
      row.backgroundSummary === undefined,
    JSON.stringify(Object.keys(row ?? {})),
  );

  const noCerts = await call(
    'GET',
    '/admin/crane-applications?withoutCertificates=true',
    null,
    token,
  );
  check(
    'withoutCertificates excludes the one that attached three',
    !(noCerts.body.data?.items ?? []).some((a) => a.id === row.id),
    JSON.stringify((noCerts.body.data?.items ?? []).map((a) => a.referenceNo)),
  );

  const detail = await call(
    'GET',
    `/admin/crane-applications/${row.id}`,
    null,
    token,
  );
  const d = detail.body.data ?? {};
  check(
    'the detail record returns the withheld fields',
    d.nationality === 'Indian' && typeof d.backgroundSummary === 'string',
    JSON.stringify({ nationality: d.nationality, mobile: d.mobile }),
  );
  check(
    'the CV is on the record',
    d.cvFile?.purpose === 'RESUME' && !!d.cvAttachedAt,
    JSON.stringify({ cv: d.cvFile?.originalName, at: d.cvAttachedAt }),
  );
  check(
    'all three certificates attached, images included',
    d.certificateFiles?.length === 3 &&
      d.certificateFiles.every((f) => f.purpose === 'CERTIFICATE') &&
      d.certificateFiles.some((f) => f.mimeType === 'image/jpeg') &&
      d.certificateFiles.some((f) => f.mimeType === 'image/png'),
    JSON.stringify(
      (d.certificateFiles ?? []).map((f) => `${f.originalName}:${f.mimeType}`),
    ),
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
    { status: 'SCREENING', note: 'CV reviewed.' },
    token,
  );
  const dueScreening = screening.body.data?.stageDueAt;
  check(
    'screening carries a deadline',
    !!dueScreening,
    JSON.stringify(dueScreening),
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
    JSON.stringify(hired.body.data?.stageDueAt),
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
  console.log(
    `created for cleanup: ${job?.slug}, ${applied.body.data?.referenceNo}`,
  );
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
