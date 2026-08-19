/**
 * Builds docs/VeltrixAir-API-Overview.docx — a two-page capability summary for
 * the UI developer.
 *
 *   node scripts/build-api-overview-docx.js
 *
 * Deliberately describes what each screen can do rather than listing routes;
 * the endpoint contracts belong in Swagger and the Postman collection, which
 * stay accurate on their own. Written straight to OOXML because a .docx is a
 * ZIP of XML — the same reason build-docs-pdf.js drives the installed Chromium
 * instead of pulling in a rendering stack.
 *
 * Content is sourced from the controllers and from role_permissions as seeded,
 * so regenerate this after any change to either.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUTPUT = path.join(__dirname, '..', 'docs', 'VeltrixAir-API-Overview.docx');

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

/**
 * Minimal deflate-backed ZIP writer. Fixed timestamps keep the output
 * byte-identical between runs, so re-generating without content changes does
 * not show up as a modified file.
 */
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
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x0021, 12); // date — 1 Jan 1980
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
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

/** One run. `size` is in points and converted to the half-points OOXML wants. */
const run = (text, { bold, italic, color, size = 8, caps } = {}) =>
  `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}` +
  `${caps ? '<w:smallCaps/>' : ''}` +
  `${color ? `<w:color w:val="${color}"/>` : ''}` +
  `<w:sz w:val="${size * 2}"/><w:szCs w:val="${size * 2}"/></w:rPr>` +
  `<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

const para = (runs, { before = 0, after = 12, indent = 0, shd, border, keep } = {}) =>
  `<w:p><w:pPr>` +
  `<w:spacing w:before="${before}" w:after="${after}" w:line="192" w:lineRule="auto"/>` +
  (indent ? `<w:ind w:left="${indent}" w:hanging="${indent > 200 ? 160 : 0}"/>` : '') +
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

const LABEL_COLOR = { Public: '0B6E4F', Admin: '1F3A5F', Staff: '8A5A00' };

/** A site or section band — white text on the brand's colour. */
const band = (text, fill) =>
  para(run(`  ${text}`, { bold: true, size: 10.5, color: 'FFFFFF' }), {
    before: 120,
    after: 54,
    shd: fill,
  });

const moduleTitle = (text) =>
  para(run(text, { bold: true, size: 9.5, color: INK }), {
    before: 64,
    after: 20,
    keep: true,
  });

/** "Public — " prefix followed by its bullets. */
const group = (label, lines) =>
  para(run(label, { bold: true, size: 7.5, color: LABEL_COLOR[label], caps: true }), {
    before: 22,
    after: 12,
    indent: 120,
    keep: true,
  }) +
  lines
    .map((line) =>
      para(run(`•   ${line}`, { size: 8.5, color: INK }), {
        after: 6,
        indent: 320,
      }),
    )
    .join('');

const note = (text) =>
  para(run(text, { size: 8.5, italic: true, color: MUTED }), {
    before: 22,
    after: 30,
    indent: 120,
  });

/* --------------------------------------------------------------- table --- */

const cell = (text, { bold, width, fill, align = 'left', color = INK } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
  (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '') +
  `<w:vAlign w:val="center"/></w:tcPr>` +
  `<w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="200" w:lineRule="auto"/>` +
  `<w:jc w:val="${align}"/></w:pPr>` +
  run(text, { bold, size: 8.5, color }) +
  `</w:p></w:tc>`;

function table(headers, rows) {
  const widths = [2500, 1150, 1250, 1100, 1000, 1000];
  const head =
    '<w:tr><w:trPr><w:tblHeader/></w:trPr>' +
    headers
      .map((h, i) =>
        cell(h, {
          bold: true,
          width: widths[i],
          fill: IT,
          color: 'FFFFFF',
          align: i === 0 ? 'left' : 'center',
        }),
      )
      .join('') +
    '</w:tr>';

  const body = rows
    .map(
      (cells, r) =>
        '<w:tr>' +
        cells
          .map((c, i) =>
            cell(c, {
              width: widths[i],
              bold: i === 0,
              fill: r % 2 ? 'F4F5F7' : undefined,
              align: i === 0 ? 'left' : 'center',
              color: c === '—' ? 'AAB0B8' : INK,
            }),
          )
          .join('') +
        '</w:tr>',
    )
    .join('');

  return (
    '<w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/>' +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D6DAE0"/>`)
      .join('') +
    '</w:tblBorders>' +
    '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>' +
    '</w:tblPr>' +
    head +
    body +
    '</w:tbl>'
  );
}

/* ------------------------------------------------------------- content --- */

const body = [
  para(run('VeltrixAir — API Capability Overview', { bold: true, size: 15, color: IT }), {
    after: 18,
  }),
  para(
    run(
      'What each screen can do, by site and module. Written for UI development — request and response ' +
        'shapes live in Swagger (/api/docs) and the Postman collection.',
      { size: 8.5, color: MUTED },
    ),
    { after: 60, border: 'D6DAE0' },
  ),
  para(
    run('How access works: ', { bold: true, size: 8.5, color: INK }) +
      run(
        'Three public sites share one backend; a visitor’s brand is resolved from the domain automatically. ' +
          'An admin picks the site and the role at sign-in — one dashboard per site + role, with no switcher inside the app. ' +
          'Someone holding two roles signs in separately for each. A role grants nothing on another brand.',
        { size: 8.5, color: MUTED },
      ),
    { before: 60, after: 40 },
  ),

  band('COMMON  —  present on all three dashboards', COMMON),

  moduleTitle('Authentication'),
  group('Admin', [
    'Sign in by choosing which dashboard (site) and which role to enter',
    'Read the sign-in screen’s available site and role options for that account',
    'Change own password — ends every active session',
    'Read own profile with live roles and the exact permissions granted',
  ]),

  moduleTitle('Staff administration'),
  group('Admin', [
    'Create a staff account — returns a temporary password, shown once and never again',
    'Grant or revoke one role on one dashboard; or replace a whole role set for a dashboard',
    'Rename, deactivate or reactivate — deactivating ends all that person’s sessions at once',
    'Reset a password, forcing re-login everywhere',
  ]),
  note('Super Admin only. No other role can see or reach this module.'),

  moduleTitle('Files'),
  group('Admin', [
    'Upload — contents are verified by magic bytes, not by the file extension',
    'Get a time-limited signed download link',
    'Delete one file, or purge everything past its retention date',
  ]),
  group('Staff', ['Content Editor uploads and views · Recruiter and Sales view only']),

  band('veltrixair.com  —  IT services   (Site 101)', IT),

  moduleTitle('Contact / Enquiries'),
  group('Public', [
    'Read the contact form’s dropdown options',
    'Submit a detailed enquiry',
  ]),
  group('Admin', [
    'List enquiries — the message body and phone number are withheld from the list',
    'Open one enquiry in full; reads of NDA-flagged enquiries are logged',
    'Change status — the first move off NEW stops the SLA clock — and assign a practitioner',
  ]),
  group('Staff', ['Sales has full control · Recruiter and Viewer can view only']),

  moduleTitle('Careers  (job postings)'),
  group('Public', [
    'Read filter options — practice, location, work mode',
    'List open roles with filters and keyword search',
    'Open one role by its slug for the job detail page',
  ]),
  group('Admin', [
    'Create, update and soft-delete roles',
    'Publish or close a role',
  ]),
  group('Staff', ['Recruiter has full control · Content Editor views and edits · Viewer views']),

  moduleTitle('Job applications'),
  group('Public', [
    'Apply to a role — the résumé is uploaded with the form, no candidate account needed',
    'Check status later through a manage link sent on submission',
    'Withdraw an application — the résumé is deleted immediately',
  ]),
  group('Admin', [
    'List applications — phone, expected salary and cover note are withheld from the list',
    'Open one in full, and request a short-lived signed résumé link (every access is logged)',
    'Change status, assign to a recruiter, add notes, read the timeline',
  ]),
  group('Staff', ['Recruiter has full control · Viewer has no access at all (candidate PII)']),

  moduleTitle('Insights  (articles)'),
  group('Public', [
    'Read filter chips — type, topic, region',
    'List article cards with filters and keyword search',
    'Request a gated download — captures the lead, then returns a signed link',
  ]),
  group('Admin', [
    'Create and update article cards; publish, unpublish or archive',
    'Attach or detach a downloadable asset',
  ]),
  group('Staff', ['Content Editor has full control · Viewer views']),

  moduleTitle('Discovery  (consultation booking)'),
  group('Public', [
    'List the practices a session can be booked against',
    'Read day-by-day availability density for the calendar grid, then slots for a chosen date',
    'Confirm a booking, then view or cancel it by manage link — cancelling frees the slot',
  ]),
  group('Admin', [
    'List and read bookings — the programme text is withheld from the list',
    'Update status; cancelling releases the slot back to free',
    'Generate slots for a date range; manage architects, their practices and weekly availability',
    'Add or remove blackouts — refused if one covers a confirmed session; deactivation likewise',
  ]),
  group('Staff', ['Sales has full control · Viewer views']),

  PAGE_BREAK,

  band('veltrixairindustries.com  —  Crane solutions   (Site 102)', INDUSTRIES),

  moduleTitle('Request a quote'),
  group('Public', [
    'Read every dropdown on the quote form, plus the conditional questions that appear per service line',
    'Submit a quote request with attachments — drawings, capacity plates, inspection certificates',
    'Track the request through a manage link — no account needed',
  ]),
  group('Admin', [
    'List requests worst-priority first — budget and commercial detail are withheld from the list',
    'Open one in full, and get a signed link for an attachment (every access is logged)',
    'Move through the pipeline — the first move stops the triage clock',
    'Assign to an engineer, add internal notes, read the timeline',
  ]),
  group('Staff', ['Sales has full control · Viewer views']),

  moduleTitle('Request a site visit'),
  group('Public', [
    'Read every dropdown on the site visit form',
    'Submit a visit request, optionally linked to an existing quote',
    'Track it through a manage link — no account needed',
  ]),
  group('Admin', [
    'List requests soonest-wanted first — site address and gate contact are withheld from the list',
    'Open one in full and read its timeline',
    'Move through the pipeline — the first move stops the 48-hour coordination clock',
    'Confirm the visit date and engineer, which also moves the request to Scheduled',
    'Assign an engineer and add internal notes',
  ]),
  group('Staff', ['Sales has full control · Viewer views']),

  note(
    'Contact and Insights run on this brand from the same modules as IT; their dropdown content is not seeded here yet.',
  ),

  band('dataprivacy.veltrixair.com  —  Privacy advisory   (Site 103)', PRIVACY),
  group('Admin', [
    'The brand, its dashboard and its role isolation are live, with a Super Admin account in place',
    'No privacy-specific module has been built yet',
    'The shared modules — Contact, Insights, Careers — work here as soon as their content is seeded',
  ]),

  band('ROLE ACCESS AT A GLANCE', COMMON),
  table(
    ['Module', 'Super Admin', 'Content Editor', 'Recruiter', 'Sales', 'Viewer'],
    [
      ['Contact', 'Full', '—', 'View', 'Full', 'View'],
      ['Careers', 'Full', 'View + edit', 'Full', '—', 'View'],
      ['Applications', 'Full', '—', 'Full', '—', '—'],
      ['Insights', 'Full', 'Full', '—', '—', 'View'],
      ['Discovery', 'Full', '—', '—', 'Full', 'View'],
      ['Crane quotes', 'Full', '—', '—', 'Full', 'View'],
      ['Crane site visits', 'Full', '—', '—', 'Full', 'View'],
      ['Files', 'Full', 'Upload + view', 'View', 'View', '—'],
      ['Staff administration', 'Full', '—', '—', '—', '—'],
    ],
  ),
  para(
    run('Full', { bold: true, size: 8, color: INK }) +
      run(' = view, create, update and delete.  ', { size: 8, color: MUTED }) +
      run('—', { bold: true, size: 8, color: INK }) +
      run(
        ' = the module is hidden entirely; the API answers 403, so the UI should not render its navigation.',
        { size: 8, color: MUTED },
      ),
    { before: 60, after: 40 },
  ),

  band('WORTH KNOWING WHEN BUILDING THE UI', COMMON),
  group('Admin', [
    'Every list is paginated and deliberately omits sensitive columns — fetch the detail record to show them',
    'Each form’s dropdowns come from its own options endpoint; never hard-code the codes in the UI',
    'Public tracking pages work off a manage token in the link — there is no customer or candidate login anywhere',
    'A revoked role takes effect on the next request, so a 403 can appear mid-session and must be handled',
  ]),
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
  `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="192" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
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
  `<dc:title>VeltrixAir — API Capability Overview</dc:title>` +
  `<dc:subject>Site and module capability summary for UI development</dc:subject>` +
  `</cp:coreProperties>`;

const buffer = zip([
  { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
  { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
  { name: 'docProps/core.xml', data: Buffer.from(coreXml, 'utf8') },
  { name: 'word/_rels/document.xml.rels', data: Buffer.from(documentRels, 'utf8') },
  { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') },
  { name: 'word/styles.xml', data: Buffer.from(stylesXml, 'utf8') },
]);

fs.writeFileSync(OUTPUT, buffer);
console.log(`Wrote ${path.relative(path.join(__dirname, '..'), OUTPUT)}  (${buffer.length} bytes)`);
