/**
 * Builds docs/VeltrixAir-UI-Backend-Gaps.docx — the UI ↔ backend reconciliation.
 *
 *   node scripts/build-ui-backend-gaps-docx.js
 *
 * Every table reads left-to-right: what the SCREEN shows, then what the API
 * actually requires or returns, then the consequence. Organised by site,
 * because the three dashboards are separate products that happen to share a
 * backend, and a UI developer works on one at a time.
 *
 * Same hand-written OOXML approach as build-api-overview-docx.js — a .docx is
 * a ZIP of XML, so there is no dependency to install and the output is
 * byte-stable between runs.
 *
 * Findings verified against the source at commit c8b929e (branch dev).
 * Re-verify after any change to a DTO, a status enum or a reference prefix.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'docs');
const OUTPUT = path.join(OUT_DIR, 'VeltrixAir-UI-Backend-Gaps.docx');

/* ------------------------------------------------------------------ zip --- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + deflated.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

/* ------------------------------------------------------------- ooxml ----- */

const esc = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const run = (text, { bold, italic, color, size = 8, caps, mono } = {}) =>
  `<w:r><w:rPr>` +
  (mono ? `<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>` : '') +
  `${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}` +
  `${caps ? '<w:smallCaps/>' : ''}` +
  `${color ? `<w:color w:val="${color}"/>` : ''}` +
  `<w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/></w:rPr>` +
  `<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

const para = (runs, { before = 0, after = 12, indent = 0, shd, border, keep } = {}) =>
  `<w:p><w:pPr>` +
  `<w:spacing w:before="${before}" w:after="${after}" w:line="200" w:lineRule="auto"/>` +
  (indent ? `<w:ind w:left="${indent}"/>` : '') +
  (shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${shd}"/>` : '') +
  (border
    ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="${border}"/></w:pBdr>`
    : '') +
  (keep ? '<w:keepNext/>' : '') +
  `</w:pPr>${runs}</w:p>`;

const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/* -------------------------------------------------------------- theme ---- */

const INK = '22252B';
const MUTED = '6B7280';
const COMMON = '3F4650';
const IT = '1F3A5F';
const INDUSTRIES = '7C4318';
const PRIVACY = '2C5545';

const BLOCKING = 'A32020'; // 400 on submit — build is broken until fixed
const UNBACKED = '8A5A00'; // UI element with nothing behind it
const OK = '0B6E4F'; // matches
const STALE = '4A5568'; // finding no longer true against current code

const band = (text, fill) =>
  para(run(`  ${text}`, { bold: true, size: 11, color: 'FFFFFF' }), {
    before: 160,
    after: 60,
    shd: fill,
  });

const heading = (text, color = INK) =>
  para(run(text, { bold: true, size: 9.5, color }), {
    before: 90,
    after: 24,
    keep: true,
  });

const intro = (text) =>
  para(run(text, { size: 8.5, color: MUTED }), {
    before: 8,
    after: 40,
    keep: true,
  });

const note = (text) =>
  para(run(text, { size: 8, italic: true, color: MUTED }), {
    before: 30,
    after: 40,
    indent: 60,
  });

/* --------------------------------------------------------------- table --- */

const WIDTHS = [3300, 4400, 2400];
const TOTAL = WIDTHS.reduce((a, b) => a + b, 0);

const cell = (text, { bold, width, fill, align = 'left', color = INK, mono } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
  (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '') +
  `<w:vAlign w:val="center"/></w:tcPr>` +
  `<w:p><w:pPr><w:spacing w:before="30" w:after="30" w:line="200" w:lineRule="auto"/>` +
  `<w:jc w:val="${align}"/></w:pPr>` +
  run(text, { bold, size: 8, color, mono }) +
  `</w:p></w:tc>`;

/**
 * Rows are [uiText, backendText, resultText] with optional per-row options
 * as a 4th element: { tone, mono: [bool,bool,bool] }.
 */
function table(rows, accent, headers = ['UI — what the screen shows', 'Backend — what the API does', 'Result']) {
  const head =
    '<w:tr><w:trPr><w:tblHeader/></w:trPr>' +
    headers
      .map((h, i) =>
        cell(h, {
          bold: true,
          width: WIDTHS[i],
          fill: accent,
          color: 'FFFFFF',
          align: i === 2 ? 'center' : 'left',
        }),
      )
      .join('') +
    '</w:tr>';

  const body = rows
    .map((row, r) => {
      const [ui, backend, result, opts = {}] = row;
      const mono = opts.mono || [false, false, false];
      const tone = opts.tone;
      const stripe = r % 2 ? 'F4F5F7' : undefined;
      return (
        '<w:tr>' +
        cell(ui, { width: WIDTHS[0], fill: stripe, mono: mono[0], bold: !!opts.boldUi }) +
        cell(backend, { width: WIDTHS[1], fill: stripe, mono: mono[1], color: INK }) +
        cell(result, {
          width: WIDTHS[2],
          fill: stripe,
          align: 'center',
          bold: true,
          color: tone || MUTED,
        }) +
        '</w:tr>'
      );
    })
    .join('');

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${TOTAL}" w:type="dxa"/>` +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D6DAE0"/>`)
      .join('') +
    '</w:tblBorders>' +
    '<w:tblCellMar><w:left w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>' +
    '</w:tblPr>' +
    head +
    body +
    '</w:tbl>'
  );
}

/** Two-column variant for the "in the database, on no screen" inventories. */
function inventory(rows, accent) {
  const w = [3300, 6800];
  const head =
    '<w:tr><w:trPr><w:tblHeader/></w:trPr>' +
    cell('Table', { bold: true, width: w[0], fill: accent, color: 'FFFFFF' }) +
    cell('Columns the API returns that no screen renders', {
      bold: true,
      width: w[1],
      fill: accent,
      color: 'FFFFFF',
    }) +
    '</w:tr>';

  const body = rows
    .map(
      ([t, cols], r) =>
        '<w:tr>' +
        cell(t, { width: w[0], fill: r % 2 ? 'F4F5F7' : undefined, mono: true, bold: true }) +
        cell(cols, { width: w[1], fill: r % 2 ? 'F4F5F7' : undefined, mono: true }) +
        '</w:tr>',
    )
    .join('');

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${w[0] + w[1]}" w:type="dxa"/>` +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D6DAE0"/>`)
      .join('') +
    '</w:tblBorders>' +
    '<w:tblCellMar><w:left w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>' +
    '</w:tblPr>' +
    head +
    body +
    '</w:tbl>'
  );
}

/* ------------------------------------------------------------- content --- */

const body = [
  /* ------------------------------------------------------------- cover -- */
  para(run('VeltrixAir — UI / Backend Reconciliation', { bold: true, size: 16, color: IT }), {
    after: 20,
  }),
  para(
    run(
      'Every place the admin dashboards and the API disagree, by site. Each table reads left to right: ' +
        'what the screen shows, what the API actually requires or returns, and the consequence.',
      { size: 8.5, color: MUTED },
    ),
    { after: 60, border: 'D6DAE0' },
  ),

  heading('How to read the Result column'),
  table(
    [
      ['Blocking', 'The screen cannot complete its job. Submitting produces a 400 and nothing is saved.', 'BLOCKING', { tone: BLOCKING }],
      ['Unbacked', 'The UI element has no column, no field and no endpoint. It displays, but nothing is stored or sent.', 'UNBACKED', { tone: UNBACKED }],
      ['Data loss', 'The request succeeds, but a distinction the backend keeps is thrown away by the UI.', 'DATA LOSS', { tone: BLOCKING }],
      ['Unreachable', 'The backend supports a state or field the UI gives no way to reach.', 'UNREACHABLE', { tone: UNBACKED }],
      ['Matches', 'Verified identical. Listed so it is not re-investigated.', 'MATCHES', { tone: OK }],
      ['Re-verify', 'Reported earlier, but no longer true against the current source. See the note below.', 'STALE', { tone: STALE }],
    ],
    COMMON,
    ['Label', 'Meaning', 'Shown as'],
  ),

  heading('Three findings that no longer hold', BLOCKING),
  intro(
    'Checked against the source at commit c8b929e. These were in the original list but do not reproduce; ' +
      'they are recorded here so nobody spends a sprint fixing them.',
  ),
  table(
    [
      [
        'JOB DESCRIPTION marked required (*) on the form, reported as optional in the backend',
        'CreateJobDto.descriptionMdx carries @IsString() and @IsNotEmpty("Please write the job description."). It is required on both sides.',
        'NOT A GAP',
        { tone: STALE, mono: [false, true, false] },
      ],
      [
        'Quote list: "Reverted back" reported as having no backend value, returning 400',
        'QUOTE_STATUSES includes REVERTED, and it is admin-settable — ADMIN_SETTABLE excludes only WITHDRAWN. It is explicitly non-terminal so the quote can move again afterwards.',
        'NOT A GAP',
        { tone: STALE, mono: [false, true, false] },
      ],
      [
        'Site visit list: "Done" reported as having no backend value',
        'Two states cover it and they are not the same thing: COMPLETED (the engineer attended) and REPORT_SENT (the write-up went out). The gap is that one UI option cannot express both, not that the value is missing.',
        'RESTATED',
        { tone: STALE, mono: [false, true, false] },
      ],
    ],
    STALE,
    ['Originally reported', 'What the source actually says', 'Status'],
  ),

  /* ------------------------------------------------------------ common -- */
  band('COMMON  —  present on all three dashboards', COMMON),

  heading('Global chrome'),
  table(
    [
      [
        'Top bar: "Search roles, candidates, requests"',
        'No cross-module search endpoint exists anywhere in the codebase. Each list endpoint has its own q filter scoped to that one module.',
        'UNBACKED',
        { tone: UNBACKED },
      ],
    ],
    COMMON,
  ),
  note(
    'Either scope the box to the current list and rename it, or build a search endpoint. As drawn it promises ' +
      'something no single API call can answer.',
  ),

  PAGE_BREAK,

  /* ---------------------------------------------------------------- IT -- */
  band('IT  —  site 101  ·  veltrixair.com  ·  it.veltrixair.com', IT),

  heading('Create job role — blocking', BLOCKING),
  intro(
    'CreateJobDto requires all five of the following and the form has no input for any of them. ' +
      'With the global ValidationPipe running whitelist + forbidNonWhitelisted, every submit is a 400 ' +
      'and no posting is ever created.',
  ),
  table(
    [
      [
        '— no input on the form',
        'refCode — string, max 20, unique. The human reference (R-001 … R-014).',
        'BLOCKING',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
      [
        '— no input on the form',
        'slug — string, max 200, unique. The public URL segment.',
        'BLOCKING',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
      [
        '— no input on the form',
        'locationLabel — string, max 150. The line the job card prints.',
        'BLOCKING',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
      [
        '— no input on the form',
        'workMode — one of ONSITE | HYBRID | REMOTE.',
        'BLOCKING',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
      [
        '— no input on the form',
        'officeCode — int, FK to office_masters.',
        'BLOCKING',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
    ],
    IT,
  ),
  note(
    'refCode and slug are the only two that need a product decision — whether the admin types them or the ' +
      'form derives them from the title. The other three are ordinary inputs.',
  ),

  heading('Create job role — required markers'),
  table(
    [
      [
        'EXPERIENCE LEVEL — shown as optional',
        'experienceLabel — string, max 50. No @IsOptional(). Required.',
        'BLOCKING',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
      [
        'JOB DESCRIPTION — shown as required (*)',
        'descriptionMdx — @IsNotEmpty(). Also required. The two agree.',
        'MATCHES',
        { tone: OK, mono: [false, true, false] },
      ],
    ],
    IT,
  ),

  heading('Create job role — cardinality'),
  table(
    [
      [
        'LOCATION — single-select dropdown, one value',
        'locationCodes: number[] with @ArrayNotEmpty(). A list, and it may not be empty.',
        'BLOCKING',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
    ],
    IT,
  ),
  note(
    'Not only a wrapper mismatch: two of the fourteen live roles already carry two locations each, so a ' +
      'single-select cannot round-trip the existing data. Editing one of those two roles through this form ' +
      'would silently drop a location.',
  ),

  heading('Create job role — unbacked'),
  table(
    [
      [
        'APPLICATION ALERTS GO TO — talent@veltrixair.com',
        'No column on job_postings, no field on the DTO, no notification-recipient concept anywhere in the API.',
        'UNBACKED',
        { tone: UNBACKED, mono: [false, true, false] },
      ],
    ],
    IT,
  ),

  heading('Job roles list'),
  table(
    [
      [
        'Status filter: Draft / Open / Closed',
        'JOB_STATUSES = DRAFT | OPEN | CLOSED.',
        'MATCHES',
        { tone: OK, mono: [false, true, false] },
      ],
      [
        'Practice shown as a short code with a colour — SW / PE / CY / DG / BA',
        'practice_area_masters has practice_code, practice_name, display_order, is_active. No short code, no colour.',
        'UNBACKED',
        { tone: UNBACKED, mono: [false, true, false] },
      ],
      [
        'Reference shown as JOB-014',
        'refCode is whatever was supplied at create time. The fourteen live IT roles are R-001 … R-014.',
        'MISMATCH',
        { tone: UNBACKED, mono: [false, true, false] },
      ],
    ],
    IT,
  ),
  note(
    'The practice short code and colour are a UI-side lookup keyed on practice_code, or two new columns on ' +
      'the master. Either is fine — but one of them has to exist before the list can render as designed.',
  ),

  heading('IT — in the database, on no screen'),
  inventory(
    [
      [
        'job_postings',
        'application_fields · work_mode · office_code · visa_sponsorship · closes_at · seo_title · seo_description · display_order',
      ],
    ],
    IT,
  ),
  note(
    'application_fields is the significant one: a per-posting toggle set covering 16 questions (phone, ' +
      'currentLocation, linkedinUrl, portfolioUrl, qualification, source, currentEmployer, totalExperience, ' +
      'relevantExperience, keySkills, currentCtc, expectedCtc, noticePeriod, willingToRelocate, ' +
      'workAuthorisation, coverNote), each with on / required / stored flags, validated end-to-end and ' +
      'already driving the public apply form. There is no UI for it anywhere.',
  ),

  PAGE_BREAK,

  /* ------------------------------------------------------------ CRANE -- */
  band('INDUSTRIES  —  site 102  ·  veltrixairindustries.com  ·  crane.veltrixair.com', INDUSTRIES),

  heading('Quote list — status options'),
  intro('Backend: NEW · TRIAGE · SITE_VISIT · PROPOSAL_SENT · WON · LOST · REVERTED · WITHDRAWN.'),
  table(
    [
      [
        'Done — one option',
        'WON and LOST are separate values.',
        'DATA LOSS',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
      [
        'no option',
        'WON, LOST — both settable by an admin, neither reachable from this UI.',
        'UNREACHABLE',
        { tone: UNBACKED, mono: [false, true, false] },
      ],
      [
        'Reverted back',
        'REVERTED — exists and is admin-settable. Non-terminal by design: the quote can move again afterwards, and it stops the triage clock.',
        'MATCHES',
        { tone: OK, mono: [false, true, false] },
      ],
      [
        'no option',
        'WITHDRAWN — deliberately excluded from the admin-settable set. It is the customer’s action, taken from the tracking page.',
        'BY DESIGN',
        { tone: OK, mono: [false, true, false] },
      ],
    ],
    INDUSTRIES,
  ),
  note(
    'Collapsing WON and LOST into "Done" is the one to fix first — it is not a cosmetic mismatch. Once a ' +
      'quote is marked through that control, which way it went is gone, and win rate becomes unrecoverable ' +
      'from the data.',
  ),

  heading('Quote list — filters'),
  table(
    [
      [
        'Urgency: All',
        'ListCraneQuotesDto has no urgencyCode. The pipeline is filtered on priority (P1–P4), which is derived at submit from urgency and, where present, the breakdown answer.',
        'BLOCKING',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
    ],
    INDUSTRIES,
  ),
  note(
    'Relabel the filter Priority and send P1–P4. Urgency is an input to triage, not the axis the queue is ' +
      'ordered on — a customer can pick Installation plus "emergency, production stopped" and never see the ' +
      'P1 question at all.',
  ),

  heading('Quote list and detail — unbacked'),
  table(
    [
      [
        'Service line colour square',
        'crane_service_line_masters has service_line_code, service_line_name, display_order, is_active. No colour.',
        'UNBACKED',
        { tone: UNBACKED, mono: [false, true, false] },
      ],
      [
        'Export CSV',
        'No CSV or export endpoint exists in the codebase.',
        'UNBACKED',
        { tone: UNBACKED },
      ],
      [
        'ROUTED TO — cranes@veltrixair.com',
        'A hardcoded QUOTES_INBOX constant in crane-quote.constants.ts. Not per-row data, so it is the same string on every quote and cannot be changed from the dashboard.',
        'UNBACKED',
        { tone: UNBACKED, mono: [false, true, false] },
      ],
    ],
    INDUSTRIES,
  ),
  note(
    'ROUTED TO is worth distinguishing from the other two. Contact and privacy enquiries DO store ' +
      'routed_to_email per row; crane quotes do not. If the dashboard needs to show it truthfully, either ' +
      'add the column or label it as a fixed destination.',
  ),

  heading('Site visit list — status options'),
  intro('Backend: NEW · COORDINATING · SCHEDULED · COMPLETED · REPORT_SENT · CANCELLED.'),
  table(
    [
      [
        'Done — one option',
        'COMPLETED (the engineer attended) and REPORT_SENT (the write-up went out) are separate states.',
        'DATA LOSS',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
      [
        'Reverted back',
        'No REVERTED on site visits. Mapping it to CANCELLED does set a valid value — but CANCELLED is terminal: every later status change and every reschedule returns 403.',
        'DATA LOSS',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
      [
        'Visit scheduled',
        'PATCH :id/status sets SCHEDULED and leaves scheduled_at NULL. The date is only written by PATCH :id/schedule, which is a different endpoint.',
        'BLOCKING',
        { tone: BLOCKING, mono: [false, true, false] },
      ],
    ],
    INDUSTRIES,
  ),
  note(
    'The scheduled_at case has a customer-visible tail: the public tracking page reads the status, so the ' +
      'customer is told the visit is scheduled while no date exists. Scheduling must go through ' +
      'PATCH :id/schedule, which takes the date, sets the status and stamps first_responded_at in one call.',
  ),

  heading('Site visit list — unbacked'),
  table(
    [
      [
        'Export CSV',
        'No CSV or export endpoint exists in the codebase.',
        'UNBACKED',
        { tone: UNBACKED },
      ],
      [
        'ROUTED TO — cranes@veltrixair.com',
        'Same hardcoded constant as the quote screen. Not per-row data.',
        'UNBACKED',
        { tone: UNBACKED, mono: [false, true, false] },
      ],
    ],
    INDUSTRIES,
  ),

  heading('Crane careers'),
  table(
    [
      [
        'Reference — no format shown in the design',
        'refCode is supplied at create time. Live crane roles use shapes like VTX-CRN-01-SIE — service line plus a role suffix, not a running number.',
        'MISMATCH',
        { tone: UNBACKED, mono: [false, true, false] },
      ],
      [
        'Status filter: Draft / Open / Closed',
        'CRANE_JOB_STATUSES = DRAFT | OPEN | CLOSED.',
        'MATCHES',
        { tone: OK, mono: [false, true, false] },
      ],
    ],
    INDUSTRIES,
  ),

  heading('Industries — in the database, on no screen'),
  inventory(
    [
      [
        'crane_quote_requests',
        'priority (P1–P4) · triage_due_at · site_visit_due_at · proposal_due_at · first_responded_at · assigned_to · attachments · manage_token',
      ],
      [
        'crane_site_visits',
        'quote_id · scheduled_at · assigned_engineer · coordination_due_at · report_due_at · first_responded_at · manage_token',
      ],
    ],
    INDUSTRIES,
  ),
  note(
    'priority and the three due dates are the operational core of the quote pipeline — they are what the ' +
      'queue is sorted by and what the SLA promise on the public page is measured against. A quote list that ' +
      'shows neither cannot tell an operator what to work on next.',
  ),

  PAGE_BREAK,

  /* ---------------------------------------------------------- PRIVACY -- */
  band('PRIVACY  —  site 103  ·  dataprivacy.veltrixair.com  ·  dp.veltrixair.com', PRIVACY),

  heading('No gaps found'),
  intro(
    'No discrepancies were reported for this dashboard, and none were found while verifying the others. ' +
      'The surface is recorded below so this section is a check rather than a blank.',
  ),
  table(
    [
      [
        'Enquiry list — status filter',
        'PRIVACY_ENQUIRY_STATUSES = NEW | IN_PROGRESS | RESOLVED | CLOSED | SPAM. All five are admin-settable.',
        'VERIFY',
        { tone: MUTED, mono: [false, true, false] },
      ],
      [
        'Enquiry detail — ROUTED TO',
        'privacy_contact_enquiries stores routed_to_email and office_code per row, so this one IS real per-row data — unlike the crane screens.',
        'BACKED',
        { tone: OK, mono: [false, true, false] },
      ],
      [
        'Enquiry detail — assignment',
        'assigned_to and assigned_at exist on the table and PATCH :id/assign is implemented.',
        'BACKED',
        { tone: OK, mono: [false, true, false] },
      ],
      [
        'Enquiry list — reference',
        'VDP-ENQ-2026-000001. Six digits, unlike the crane four.',
        'CHECK WIDTH',
        { tone: MUTED, mono: [false, true, false] },
      ],
    ],
    PRIVACY,
  ),
  note(
    'Worth confirming against the Figma before signing this off: the five statuses above include SPAM, ' +
      'which the other two dashboards do not have, and jurisdiction and service are FK-backed dropdowns ' +
      'that must be read from the options endpoint rather than hard-coded.',
  ),

  /* -------------------------------------------------------- references -- */
  band('REFERENCE NUMBER FORMATS  —  all sites', COMMON),

  heading('What the API actually issues'),
  intro(
    'Every prefix below is a constant in the owning service, combined with a Postgres sequence and the ' +
      'current year. A shared reference column must render whatever string arrives — the shapes are not ' +
      'interchangeable and the padding is not uniform.',
  ),
  table(
    [
      ['RFQ-2026-0341', 'VTX-RFQ-2026-0341 — crane quote, 4 digits', 'MISMATCH', { tone: UNBACKED, mono: [true, true, false] }],
      ['VST-2026-0118', 'VTX-VST-2026-0118 — crane site visit, 4 digits', 'MISMATCH', { tone: UNBACKED, mono: [true, true, false] }],
      ['JOB-014', 'R-001 … R-014 — IT job posting, author-supplied, not a sequence', 'MISMATCH', { tone: UNBACKED, mono: [true, true, false] }],
      ['—', 'VTX-CRN-01-SIE — crane job posting, author-supplied, different shape again', 'CHECK', { tone: MUTED, mono: [true, true, false] }],
      ['—', 'VTX-HR-2026-000001 — crane job application, 6 digits', 'CHECK', { tone: MUTED, mono: [true, true, false] }],
      ['—', 'VLX-APP-2026-000001 — IT job application, 6 digits', 'CHECK', { tone: MUTED, mono: [true, true, false] }],
      ['—', 'VLX-2026-000001 — IT contact enquiry, 6 digits', 'CHECK', { tone: MUTED, mono: [true, true, false] }],
      ['—', 'VDP-ENQ-2026-000001 — privacy enquiry, 6 digits', 'CHECK', { tone: MUTED, mono: [true, true, false] }],
      ['—', 'DC-2026-000001 — discovery booking, 6 digits', 'CHECK', { tone: MUTED, mono: [true, true, false] }],
    ],
    COMMON,
    ['UI — reference as designed', 'Backend — reference as issued', 'Result'],
  ),
  note(
    'Two careers boards, two unrelated reference shapes, and neither is sequence-generated — both are typed ' +
      'by whoever creates the posting. Any column showing a reference should print the string verbatim and ' +
      'never parse, pad or reformat it.',
  ),

  /* ------------------------------------------------------------ tally --- */
  band('SUMMARY', COMMON),

  table(
    [
      ['IT — Create job role', '5 missing required fields, 1 inverted marker, 1 cardinality mismatch', '7 BLOCKING', { tone: BLOCKING }],
      ['IT — Job roles list', '1 unbacked practice code + colour, 1 reference mismatch', '2 ITEMS', { tone: UNBACKED }],
      ['Industries — Quote', '1 data loss, 1 unreachable pair, 1 broken filter, 3 unbacked', '6 ITEMS', { tone: BLOCKING }],
      ['Industries — Site visit', '2 data loss, 1 blocking schedule path, 2 unbacked', '5 ITEMS', { tone: BLOCKING }],
      ['Industries — Careers', '1 reference mismatch', '1 ITEM', { tone: UNBACKED }],
      ['Privacy', 'No discrepancies found', 'CLEAR', { tone: OK }],
      ['Common', '1 unbacked global search', '1 ITEM', { tone: UNBACKED }],
      ['All sites', '9 distinct reference formats, none interchangeable', 'RENDER VERBATIM', { tone: MUTED }],
    ],
    COMMON,
    ['Area', 'What is outstanding', 'Count'],
  ),

  note(
    'Fix order suggested by consequence rather than effort: the seven blocking items on Create job role ' +
      '(no posting can be created at all), then the site-visit schedule path (a customer is told a date ' +
      'exists when it does not), then the WON / LOST collapse (data destroyed on every use), then the ' +
      'unbacked elements, which are visible but harmless until someone relies on them.',
  ),

  para(
    run(
      'Verified against the source at commit c8b929e, branch dev. Re-run node scripts/build-ui-backend-gaps-docx.js ' +
        'after any change to a DTO, a status enum or a reference prefix.',
      { size: 7.5, italic: true, color: MUTED },
    ),
    { before: 120, after: 0 },
  ),
].join('');

/* ----------------------------------------------------------- assemble ---- */

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:body>${body}` +
  `<w:sectPr>` +
  `<w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="680" w:right="740" w:bottom="620" w:left="740" w:header="0" w:footer="0" w:gutter="0"/>` +
  `</w:sectPr></w:body></w:document>`;

const stylesXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:docDefaults><w:rPrDefault><w:rPr>` +
  `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
  `<w:sz w:val="18"/><w:szCs w:val="18"/>` +
  `</w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="200" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
  `</w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal">` +
  `<w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;

const contentTypes =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
  `</Types>`;

const rootRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `</Relationships>`;

const documentRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

const coreXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
  `xmlns:dc="http://purl.org/dc/elements/1.1/">` +
  `<dc:title>VeltrixAir — UI / Backend Reconciliation</dc:title>` +
  `<dc:subject>Screen-by-screen gaps between the admin dashboards and the API, by site</dc:subject>` +
  `</cp:coreProperties>`;

const buffer = zip([
  { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
  { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
  { name: 'docProps/core.xml', data: Buffer.from(coreXml, 'utf8') },
  { name: 'word/_rels/document.xml.rels', data: Buffer.from(documentRels, 'utf8') },
  { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') },
  { name: 'word/styles.xml', data: Buffer.from(stylesXml, 'utf8') },
]);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT, buffer);
console.log(`Wrote ${path.relative(path.join(__dirname, '..'), OUTPUT)}  (${buffer.length} bytes)`);
