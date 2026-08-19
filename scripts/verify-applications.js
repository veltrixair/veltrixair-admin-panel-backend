/**
 * End-to-end check of the applications module against a running server.
 *
 *   SUPER_EMAIL=... node scripts/verify-applications.js <superPw> <editorPw>
 *
 * Creates its own recruiter account and its own applications, and cleans both
 * up at the end so it can be run repeatedly.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const SUPER = {
  email: process.env.SUPER_EMAIL || 'admin@veltrixair.com',
  password: process.argv[2],
};
const EDITOR = {
  email: process.env.EDITOR_EMAIL || 'editor@veltrixair.com',
  password: process.argv[3],
};

const ROLE = { RECRUITER: 103 };

let passed = 0;
let failed = 0;
const createdEmails = [];
const applicantEmails = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { body, token, form } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(form ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    /* empty */
  }
  return { status: response.status, body: json };
}

async function attemptLogin(credentials) {
  let r = await call('POST', '/admin/auth/login', { body: credentials });
  if (r.status === 429) {
    console.log('        (login throttle — waiting 61s)');
    await sleep(61_000);
    r = await call('POST', '/admin/auth/login', { body: credentials });
  }
  return r;
}

async function login(credentials) {
  const r = await attemptLogin(credentials);
  if (r.status !== 200) {
    throw new Error(
      `Could not sign in as ${credentials.email}: ${r.status} ${JSON.stringify(r.body)}`,
    );
  }
  return r.body.data.accessToken;
}

/** A minimal but genuinely valid PDF — the magic-byte check is real. */
function pdfBlob() {
  const pdf =
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n';
  return new Blob([pdf], { type: 'application/pdf' });
}

function applicationForm(overrides = {}, file = pdfBlob(), filename = 'cv.pdf') {
  const form = new FormData();
  const fields = {
    firstName: 'Layla',
    lastName: 'Haddad',
    email: overrides.email ?? `applicant-${Date.now()}@example.com`,
    phone: '+966 55 123 4567',
    currentTitle: 'Senior Platform Engineer',
    qualificationCode: '104',
    experienceYears: '7.5',
    linkedinUrl: 'https://www.linkedin.com/in/example',
    city: 'Riyadh',
    countryCode: '101',
    noticePeriodCode: '103',
    workAuthorisationCode: '101',
    expectedSalary: '420000',
    salaryCurrency: 'SAR',
    coverNote: 'I have led three core-banking modernisations under PDPL.',
    sourceCode: '101',
    consentGiven: 'true',
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) form.append(k, String(v));
  }
  if (file) form.append('resume', file, filename);
  return form;
}

async function dbClient() {
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
  return client;
}

async function cleanup() {
  const client = await dbClient();
  let removed = 0;
  if (applicantEmails.length) {
    const r = await client.query(
      'DELETE FROM job_applications WHERE email = ANY($1::text[])',
      [applicantEmails],
    );
    removed += r.rowCount;
  }
  if (createdEmails.length) {
    const r = await client.query(
      'DELETE FROM admins WHERE email = ANY($1::text[])',
      [createdEmails],
    );
    removed += r.rowCount;
  }
  await client.end();
  console.log(`\n  cleaned up ${removed} test row(s)`);
}

(async () => {
  if (!SUPER.password || !EDITOR.password) {
    throw new Error(
      'Usage: node scripts/verify-applications.js <superPassword> <editorPassword>',
    );
  }

  const superToken = await login(SUPER);
  const editorToken = await login(EDITOR);

  console.log('\n1. Form options\n');

  const options = await call('GET', '/careers/apply-options');
  check('apply-options → 200', options.status === 200, `got ${options.status}`);
  const o = options.body?.data ?? {};
  check('6 qualifications', o.qualifications?.length === 6, `got ${o.qualifications?.length}`);
  check('5 notice periods', o.noticePeriods?.length === 5, `got ${o.noticePeriods?.length}`);
  check('4 work authorisations', o.workAuthorisations?.length === 4, `got ${o.workAuthorisations?.length}`);
  check('6 sources', o.sources?.length === 6, `got ${o.sources?.length}`);
  check('countries reused, not duplicated', (o.countries?.length ?? 0) > 0);
  check('codes start at 101', o.qualifications?.[0]?.code === 101, `got ${o.qualifications?.[0]?.code}`);

  console.log('\n2. Applying\n');

  const jobs = await call('GET', '/careers/jobs?limit=1');
  const slug = jobs.body?.data?.items?.[0]?.slug;
  check('found an open role to apply to', !!slug, JSON.stringify(jobs.body?.data?.items?.[0]));

  const email = `verify-applicant-${Date.now()}@example.com`;
  applicantEmails.push(email);

  const applied = await call('POST', `/careers/jobs/${slug}/apply`, {
    form: applicationForm({ email }),
  });
  check('apply → 201', applied.status === 201, `got ${applied.status} ${JSON.stringify(applied.body?.message)}`);

  const manageToken = applied.body?.data?.manageToken;
  const referenceNo = applied.body?.data?.referenceNo;
  check('returns a reference number', /^VLX-APP-\d{4}-\d{6}$/.test(referenceNo ?? ''), referenceNo);
  check('returns a manage token', (manageToken ?? '').length === 48, `length ${manageToken?.length}`);

  const duplicate = await call('POST', `/careers/jobs/${slug}/apply`, {
    form: applicationForm({ email }),
  });
  check('same email, same role → 409', duplicate.status === 409, `got ${duplicate.status}`);

  console.log('\n3. Rejected submissions\n');

  const noConsent = await call('POST', `/careers/jobs/${slug}/apply`, {
    form: applicationForm({ email: `nc-${Date.now()}@example.com`, consentGiven: 'false' }),
  });
  check('no consent → 400', noConsent.status === 400, `got ${noConsent.status}`);

  const noResume = await call('POST', `/careers/jobs/${slug}/apply`, {
    form: applicationForm({ email: `nr-${Date.now()}@example.com` }, null),
  });
  check('no résumé → 400', noResume.status === 400, `got ${noResume.status}`);

  const fakePdf = await call('POST', `/careers/jobs/${slug}/apply`, {
    form: applicationForm(
      { email: `fp-${Date.now()}@example.com` },
      new Blob(['this is not a pdf'], { type: 'application/pdf' }),
      'fake.pdf',
    ),
  });
  check('a .txt renamed .pdf → 400 (magic bytes)', fakePdf.status === 400, `got ${fakePdf.status}`);

  const badCode = await call('POST', `/careers/jobs/${slug}/apply`, {
    form: applicationForm({ email: `bc-${Date.now()}@example.com`, qualificationCode: '999' }),
  });
  check('unknown qualification code → 404', badCode.status === 404, `got ${badCode.status}`);

  const salaryNoCurrency = await call('POST', `/careers/jobs/${slug}/apply`, {
    form: applicationForm({
      email: `snc-${Date.now()}@example.com`,
      salaryCurrency: null,
    }),
  });
  check('salary without currency → 409', salaryNoCurrency.status === 409, `got ${salaryNoCurrency.status}`);

  const noSuchJob = await call('POST', '/careers/jobs/not-a-real-role/apply', {
    form: applicationForm({ email: `ns-${Date.now()}@example.com` }),
  });
  check('unknown role → 404', noSuchJob.status === 404, `got ${noSuchJob.status}`);

  console.log('\n4. The candidate view (no account)\n');

  const view = await call('GET', `/careers/applications/${manageToken}`);
  check('status by token → 200', view.status === 200, `got ${view.status}`);
  check('shows NEW', view.body?.data?.status === 'NEW', view.body?.data?.status);
  check('can withdraw', view.body?.data?.canWithdraw === true);
  check(
    'candidate view leaks no PII',
    !JSON.stringify(view.body).includes('55 123 4567') &&
      !JSON.stringify(view.body).includes('420000'),
  );

  const badToken = await call('GET', '/careers/applications/' + 'f'.repeat(48));
  check('unknown token → 404', badToken.status === 404, `got ${badToken.status}`);

  console.log('\n5. Who may read candidate data\n');

  const editorList = await call('GET', '/admin/applications', { token: editorToken });
  check('CONTENT_EDITOR → 403 (has CAREERS, not APPLICATIONS)', editorList.status === 403, `got ${editorList.status}`);

  const anon = await call('GET', '/admin/applications');
  check('no token → 401', anon.status === 401, `got ${anon.status}`);

  const recruiterEmail = `verify-recruiter-${Date.now()}@veltrixair.com`;
  const recruiter = await call('POST', '/admin/staff', {
    token: superToken,
    body: { email: recruiterEmail, fullName: 'Verify Recruiter', roleCodes: [ROLE.RECRUITER] },
  });
  check('created a recruiter → 201', recruiter.status === 201, `got ${recruiter.status}`);
  createdEmails.push(recruiterEmail);

  const recruiterToken = await login({
    email: recruiterEmail,
    password: recruiter.body?.data?.temporaryPassword,
  });

  const recruiterList = await call('GET', '/admin/applications', { token: recruiterToken });
  check('RECRUITER lists applications → 200', recruiterList.status === 200, `got ${recruiterList.status}`);

  console.log('\n6. PII is held back from the list\n');

  const listJson = JSON.stringify(recruiterList.body);
  check('list omits phone', !listJson.includes('55 123 4567'));
  check('list omits expected salary', !listJson.includes('420000'));
  check('list omits the cover note', !listJson.includes('core-banking modernisations'));
  check('list omits the manage token', !listJson.includes(manageToken));

  const applicationId = recruiterList.body?.data?.items?.find(
    (i) => i.email === email,
  )?.id;
  check('our application is in the list', !!applicationId);

  const detail = await call('GET', `/admin/applications/${applicationId}`, { token: recruiterToken });
  const detailJson = JSON.stringify(detail.body);
  check('detail includes phone', detailJson.includes('55 123 4567'));
  check('detail includes salary and currency', detailJson.includes('420000') && detailJson.includes('SAR'));
  check('detail includes the cover note', detailJson.includes('core-banking modernisations'));
  check('detail still omits the manage token', !detailJson.includes(manageToken));
  check('joins the qualification', detail.body?.data?.qualification?.qualificationName?.length > 0);

  console.log('\n7. Résumé access is logged\n');

  const resume = await call('GET', `/admin/applications/${applicationId}/resume`, { token: recruiterToken });
  check('signed URL issued → 200', resume.status === 200, `got ${resume.status}`);
  check('URL is time limited', (resume.body?.data?.expiresInSeconds ?? 0) > 0);

  const events = await call('GET', `/admin/applications/${applicationId}/events`, { token: recruiterToken });
  const types = (events.body?.data ?? []).map((e) => e.eventType);
  check('CREATED recorded', types.includes('CREATED'));
  check('RESUME_VIEWED recorded', types.includes('RESUME_VIEWED'));
  check(
    'records who downloaded it',
    (events.body?.data ?? []).some(
      (e) => e.eventType === 'RESUME_VIEWED' && e.actor === recruiterEmail,
    ),
  );

  console.log('\n8. Pipeline\n');

  const screening = await call('PATCH', `/admin/applications/${applicationId}/status`, {
    token: recruiterToken,
    body: { status: 'SHORTLISTED', note: 'Strong PDPL background' },
  });
  check('status → SHORTLISTED', screening.status === 200 && screening.body?.data?.status === 'SHORTLISTED', `got ${screening.status}`);

  const cannotWithdrawAsAdmin = await call('PATCH', `/admin/applications/${applicationId}/status`, {
    token: recruiterToken,
    body: { status: 'WITHDRAWN' },
  });
  check('admin cannot set WITHDRAWN → 400', cannotWithdrawAsAdmin.status === 400, `got ${cannotWithdrawAsAdmin.status}`);

  const note = await call('POST', `/admin/applications/${applicationId}/notes`, {
    token: recruiterToken,
    body: { note: 'Phone screen booked for Sunday.' },
  });
  check('note added → 201', note.status === 201, `got ${note.status}`);
  check('note records the actor', note.body?.data?.actor === recruiterEmail, note.body?.data?.actor);

  console.log('\n9. Withdrawal deletes the résumé\n');

  const client = await dbClient();
  const before = await client.query(
    'SELECT resume_file_id FROM job_applications WHERE email = $1',
    [email],
  );
  const resumeFileId = before.rows[0]?.resume_file_id;
  check('résumé is attached before withdrawal', !!resumeFileId);

  const withdrawn = await call('POST', `/careers/applications/${manageToken}/withdraw`);
  check('withdraw → 200', withdrawn.status === 200, `got ${withdrawn.status}`);

  const after = await client.query(
    'SELECT status, withdrawn_at, resume_file_id, cover_note FROM job_applications WHERE email = $1',
    [email],
  );
  const row = after.rows[0];
  check('status is WITHDRAWN', row?.status === 'WITHDRAWN', row?.status);
  check('withdrawn_at is stamped', !!row?.withdrawn_at);
  check('résumé detached from the application', row?.resume_file_id === null);
  check('cover note cleared', row?.cover_note === null);

  const fileRow = await client.query('SELECT id FROM stored_files WHERE id = $1', [resumeFileId]);
  check('stored_files row deleted', fileRow.rowCount === 0, `${fileRow.rowCount} row(s) remain`);
  await client.end();

  const resumeAfter = await call('GET', `/admin/applications/${applicationId}/resume`, { token: recruiterToken });
  check('résumé link now → 410 Gone', resumeAfter.status === 410, `got ${resumeAfter.status}`);

  const withdrawTwice = await call('POST', `/careers/applications/${manageToken}/withdraw`);
  check('withdrawing twice → 409', withdrawTwice.status === 409, `got ${withdrawTwice.status}`);

  const reopen = await call('PATCH', `/admin/applications/${applicationId}/status`, {
    token: recruiterToken,
    body: { status: 'SCREENING' },
  });
  check('admin cannot reopen a withdrawal → 403', reopen.status === 403, `got ${reopen.status}`);

  console.log('\n10. Re-applying after withdrawal\n');

  const reapply = await call('POST', `/careers/jobs/${slug}/apply`, {
    form: applicationForm({ email }),
  });
  check('may apply again once withdrawn → 201', reapply.status === 201, `got ${reapply.status}`);

  await cleanup();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
});
