/**
 * Checks that a posting's application-field configuration is enforced.
 *
 *   SUPER_EMAIL=... node scripts/verify-application-fields.js <password>
 *
 * The toggles are a frontend feature only in the sense that the frontend draws
 * them. If the server does not also enforce them, "required" is a suggestion, a
 * switched-off question still lands in the table, and a null answer becomes
 * permanently ambiguous — did the candidate skip it, or was it never asked?
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SUPER = {
  email: process.env.SUPER_EMAIL || 'admin@veltrixair.com',
  password: process.argv[2],
};
const IT_SITE = 101;

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

const json = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Site-Code': String(IT_SITE),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
};

const pdf = () =>
  new Blob(['%PDF-1.4\ntrailer<</Root 1 0 R>>\n%%EOF\n'], {
    type: 'application/pdf',
  });

const apply = async (slug, fields) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((x) => form.append(k, x));
    else form.append(k, v);
  }
  form.append('resume', pdf(), 'cv.pdf');
  const res = await fetch(`${BASE}/careers/jobs/${slug}/apply`, {
    method: 'POST',
    headers: { 'X-Site-Code': String(IT_SITE) },
    body: form,
  });
  return { status: res.status, body: await res.json() };
};

/**
 * The always-on four, plus everything the DEFAULTS mark required — phone,
 * total experience, expected CTC and notice period. A probe that omitted
 * those would fail for the wrong reason and tell us nothing about toggles.
 */
const baseAnswers = () => ({
  firstName: 'Field',
  lastName: 'Probe',
  email: `af-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
  phone: '+966 55 000 0000',
  experienceYears: '6',
  expectedSalary: '30000',
  salaryCurrency: 'SAR',
  noticePeriodCode: '103',
  consentGiven: 'true',
});

(async () => {
  if (!SUPER.password) {
    console.error('Pass the super admin password as the first argument.');
    process.exit(1);
  }

  const login = await json('POST', '/admin/auth/login', {
    ...SUPER,
    siteCode: IT_SITE,
    roleCode: 101,
  });
  if (login.status !== 200) {
    console.error('could not sign in:', login.status, login.body.message);
    process.exit(1);
  }
  const token = login.body.data.accessToken;

  const jobs = await json('GET', '/admin/careers/jobs?limit=1', null, token);
  const job = jobs.body.data?.items?.[0];
  if (!job) {
    console.error('no job posting to configure');
    process.exit(1);
  }
  console.log(`\nUsing role "${job.title}" (${job.slug})`);
  const restore = job.applicationFields ?? null;

  console.log('\nThe form is served from the stored configuration');
  const configured = await json(
    'PATCH',
    `/admin/careers/jobs/${job.id}`,
    {
      applicationFields: {
        currentCtc: { on: false },
        portfolioUrl: { on: true, required: true },
        coverNote: { on: false },
      },
    },
    token,
  );
  check(
    'a valid configuration is accepted',
    configured.status === 200,
    `${configured.status} ${JSON.stringify(configured.body.data ?? configured.body.message)}`,
  );

  const bad = await json(
    'PATCH',
    `/admin/careers/jobs/${job.id}`,
    { applicationFields: { nosuchfield: { on: true } } },
    token,
  );
  check(
    'an unknown question is rejected, not stored and ignored',
    bad.status === 400,
    `${bad.status} ${JSON.stringify(bad.body.data ?? bad.body.message)}`,
  );

  const detail = await json('GET', `/careers/jobs/${job.slug}`);
  const served = detail.body.data?.applicationFields ?? [];
  const keys = served.map((f) => f.key);
  check(
    'the public form omits the questions switched off',
    !keys.includes('currentCtc') && !keys.includes('coverNote'),
    JSON.stringify(keys),
  );
  check(
    'and marks the one made required',
    served.find((f) => f.key === 'portfolioUrl')?.required === true,
    JSON.stringify(served.find((f) => f.key === 'portfolioUrl')),
  );

  console.log('\nThe server enforces the same configuration');
  const sneaked = await apply(job.slug, {
    ...baseAnswers(),
    portfolioUrl: 'https://github.com/probe',
    currentCtc: 'SAR 30,000',
  });
  check(
    'an answer to a switched-off question is refused',
    sneaked.status === 400 &&
      JSON.stringify(sneaked.body.data).includes('Current CTC'),
    `${sneaked.status} ${JSON.stringify(sneaked.body.data ?? sneaked.body.message)}`,
  );

  const missing = await apply(job.slug, baseAnswers());
  check(
    'a required question left blank is refused',
    missing.status === 400 &&
      JSON.stringify(missing.body.data).includes('Portfolio'),
    `${missing.status} ${JSON.stringify(missing.body.data ?? missing.body.message)}`,
  );

  const good = await apply(job.slug, {
    ...baseAnswers(),
    portfolioUrl: 'https://github.com/probe',
    keySkills: ['Terraform', 'Kubernetes'],
    currentCompany: 'Northwind',
    relevantExperienceYears: '4',
    willingToRelocate: 'true',
  });
  check(
    'a submission matching the configuration is accepted',
    good.status === 201,
    `${good.status} ${JSON.stringify(good.body.data ?? good.body.message)}`,
  );

  if (good.status === 201) {
    const list = await json(
      'GET',
      `/admin/applications?search=${encodeURIComponent(good.body.data.referenceNo)}`,
      null,
      token,
    );
    const stored = list.body.data?.items?.[0];
    const full = await json(
      'GET',
      `/admin/applications/${stored.id}`,
      null,
      token,
    );
    const a = full.body.data;
    check(
      'the new answers are stored',
      Array.isArray(a.keySkills) &&
        a.keySkills.includes('Terraform') &&
        a.currentCompany === 'Northwind' &&
        Number(a.relevantExperienceYears) === 4 &&
        a.willingToRelocate === true,
      JSON.stringify({
        keySkills: a.keySkills,
        currentCompany: a.currentCompany,
        relevant: a.relevantExperienceYears,
        relocate: a.willingToRelocate,
      }),
    );
    check(
      'a question that was not asked is null, not blank',
      a.currentCtc === null || a.currentCtc === undefined,
      JSON.stringify({ currentCtc: a.currentCtc }),
    );
    console.log(`\ncreated for cleanup: ${good.body.data.referenceNo}`);
  }

  await json(
    'PATCH',
    `/admin/careers/jobs/${job.id}`,
    { applicationFields: restore },
    token,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
