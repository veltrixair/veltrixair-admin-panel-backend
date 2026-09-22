/**
 * Builds docs/VeltrixAir-API-Reference.docx — every endpoint, by unit and role.
 *
 *   node scripts/build-api-reference-docx.js
 *
 * Sources, in order of authority:
 *
 *   - the controllers, parsed for path, HTTP verb, @Permissions and @SiteScope
 *   - the running server's OpenAPI document, for summaries the parser cannot
 *     resolve (some are built by string concatenation across lines)
 *   - role_permissions as seeded, for who reaches what
 *
 * Requires the dev server on BASE_URL and a database connection, and is meant
 * to be re-run after any route change rather than edited.
 *
 * WHY IT IS LAID OUT THIS WAY
 *
 * The obvious shape — one section per role — prints every path once per role
 * that can reach it. SUPER_ADMIN holds all twelve features, so it alone would
 * repeat all 101 admin routes, and VIEWER would repeat most of them again.
 *
 * So endpoints are listed once, under the unit that owns them, with a column
 * naming the roles. The role-first view people actually want is section 5,
 * where each role gets a short page describing its reach rather than a second
 * copy of the routes.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUTPUT = path.join(__dirname, '..', 'docs', 'VeltrixAir-API-Reference.docx');
const BASE = process.env.BASE_URL || 'http://localhost:3000';

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

/** A .docx is a ZIP of XML, so this writes one rather than pulling in a stack. */
function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const deflated = zlib.deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, name, deflated);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(deflated.length, 20);
    dir.writeUInt32LE(entry.data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt16LE(0, 30);
    dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34);
    dir.writeUInt16LE(0, 36);
    dir.writeUInt32LE(0, 38);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += local.length + name.length + deflated.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuffer, end]);
}

/* ------------------------------------------------------------- ooxml ----- */

const esc = (t) =>
  String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const run = (text, { bold, italic, color, size = 8, caps, mono } = {}) =>
  `<w:r><w:rPr>` +
  (mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : '') +
  (bold ? '<w:b/>' : '') +
  (italic ? '<w:i/>' : '') +
  (caps ? '<w:smallCaps/>' : '') +
  (color ? `<w:color w:val="${color}"/>` : '') +
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
const RULE = 'D6DAE0';
const COMMON = '3F4650';
const BRAND = {
  IT: '1F3A5F',
  INDUSTRIES: '7C4318',
  PRIVACY: '2C5545',
  COMMON,
};

const band = (text, fill) =>
  para(run(`  ${text}`, { bold: true, size: 11, color: 'FFFFFF' }), {
    before: 160,
    after: 60,
    shd: fill,
  });

const h2 = (text, color = INK) =>
  para(run(text, { bold: true, size: 9.5, color }), {
    before: 90,
    after: 24,
    keep: true,
  });

const note = (text) =>
  para(run(text, { size: 8, italic: true, color: MUTED }), {
    before: 16,
    after: 40,
  });

/* --------------------------------------------------------------- table --- */

const WIDTHS = [620, 3050, 2900, 1430];

const cell = (text, { bold, width, fill, align = 'left', color = INK, mono } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
  (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '') +
  `<w:vAlign w:val="center"/></w:tcPr>` +
  `<w:p><w:pPr><w:spacing w:before="16" w:after="16" w:line="200" w:lineRule="auto"/>` +
  `<w:jc w:val="${align}"/></w:pPr>` +
  run(text, { bold, size: 7.5, color, mono }) +
  `</w:p></w:tc>`;

function table(rows, headFill) {
  const headers = ['', 'Endpoint', 'What it does', 'Who can reach it'];
  const head =
    '<w:tr><w:trPr><w:tblHeader/></w:trPr>' +
    headers
      .map((h, i) =>
        cell(h, { bold: true, width: WIDTHS[i], fill: headFill, color: 'FFFFFF' }),
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
              width: WIDTHS[i],
              bold: i === 0,
              mono: i <= 1,
              fill: r % 2 ? 'F5F6F8' : undefined,
              color: i === 3 && c === 'anyone' ? '0B6E4F' : INK,
            }),
          )
          .join('') +
        '</w:tr>',
    )
    .join('');

  return (
    '<w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>`)
      .join('') +
    '</w:tblBorders>' +
    '<w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar>' +
    '</w:tblPr>' +
    head +
    body +
    '</w:tbl>'
  );
}

/* -------------------------------------------------------------- routes --- */

const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.controller.ts')) out.push(p);
  }
  return out;
};

/**
 * Scans FORWARD from each HTTP verb.
 *
 * Nest puts @Get() first and @Permissions after it, so a backward scan loses
 * the feature on the first route of every controller — which is always the
 * list route, and therefore always the one people look up first.
 */
function readRoutes() {
  const routes = [];
  for (const file of walk(path.join(__dirname, '..', 'src'))) {
    const src = fs.readFileSync(file, 'utf8');
    const prefix = (src.match(/@Controller\('([^']*)'\)/) || [, ''])[1];
    const scope = (src.match(/@SiteScope\(SITE\.([A-Z_]+)\)/) || [])[1] || null;
    const lines = src.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const v = lines[i].match(
        /^\s*@(Get|Post|Patch|Put|Delete)\(\s*'?([^')]*)'?\s*\)\s*$/,
      );
      if (!v) continue;

      let end = i + 1;
      while (end < lines.length && /^\s*@|^\s*\*|^\s*\/\*|^\s*$/.test(lines[end])) end++;
      const block = lines.slice(i, Math.min(end + 1, lines.length)).join('\n');

      const p = block.match(/@Permissions\(\s*FEATURE\.([A-Z_]+),\s*PERMISSION\.([A-Z_]+)/);
      const s = block.match(/summary:\s*\n?\s*'((?:[^']|\\')*)'/);
      const sub = v[2] || '';

      routes.push({
        module: path.basename(file).replace('.controller.ts', ''),
        method: v[1].toUpperCase(),
        path: ('/' + prefix + (sub ? '/' + sub : '')).replace(/\/+/g, '/'),
        feature: p ? p[1] : null,
        permission: p ? p[2] : null,
        summary: s ? s[1] : null,
        scope,
      });
    }
  }
  return routes;
}

/** Some summaries are concatenated across lines; the spec has them resolved. */
async function fillSummaries(routes) {
  let spec;
  try {
    spec = await (await fetch(`${BASE}/api/docs-json`)).json();
  } catch {
    console.warn(`! ${BASE} unreachable — a few summaries will be blank.`);
    return 0;
  }
  const byKey = {};
  for (const [p, ops] of Object.entries(spec.paths ?? {})) {
    for (const [m, op] of Object.entries(ops)) {
      if (!['get', 'post', 'patch', 'put', 'delete'].includes(m)) continue;
      byKey[`${m.toUpperCase()} ${p.replace(/\{([^}]+)\}/g, ':$1')}`] = op.summary;
    }
  }
  let filled = 0;
  for (const r of routes) {
    if (r.summary) continue;
    const s = byKey[`${r.method} ${r.path}`];
    if (s) {
      r.summary = s;
      filled++;
    }
  }
  return filled;
}

/** The two routes with no @ApiOperation anywhere. */
const FALLBACK = {
  'GET /': 'Health check — confirms the service is up',
  'GET /files/local/:key': 'Serve an uploaded file in development',
};

/* --------------------------------------------------------------- roles --- */

async function readMatrix() {
  require('ts-node/register');
  require('dotenv').config({ path: 'config/dev.env' });
  const { AppDataSource } = require('../src/data-source.ts');
  await AppDataSource.initialize();

  const roles = await AppDataSource.query(
    'SELECT role_code, role_name FROM role_masters WHERE is_active = true ORDER BY role_code',
  );
  const grants = await AppDataSource.query(
    `SELECT rp.role_code, f.feature_name, p.permission_name
       FROM role_permissions rp
       JOIN feature_masters f ON f.feature_code = rp.feature_code
       JOIN permission_masters p ON p.permission_code = rp.permission_code`,
  );
  await AppDataSource.destroy();

  const nameOf = new Map(roles.map((r) => [r.role_code, r.role_name]));
  const byFeature = {};
  for (const g of grants) {
    byFeature[g.feature_name] ??= {};
    byFeature[g.feature_name][nameOf.get(g.role_code)] ??= new Set();
    byFeature[g.feature_name][nameOf.get(g.role_code)].add(g.permission_name);
  }
  return { roles, byFeature };
}

/** Short role labels, so the column stays readable at 7.5pt. */
const SHORT = {
  SUPER_ADMIN: 'Super admin',
  CONTENT_EDITOR: 'Editor',
  RECRUITER: 'Recruiter',
  SALES: 'Sales',
  VIEWER: 'Viewer',
  PENDING: 'Pending',
};

/**
 * Reached before a session exists.
 *
 * They sit under /admin by URL, which is why they need naming here — the path
 * prefix is a routing convention, not a statement about who may call them.
 */
const UNAUTHENTICATED = new Set([
  'POST /admin/auth/login',
  'GET /admin/auth/login-options',
  'POST /admin/auth/refresh',
]);

function whoReaches(route, byFeature) {
  if (UNAUTHENTICATED.has(`${route.method} ${route.path}`)) return 'anyone';
  if (!route.path.startsWith('/admin')) return 'anyone';
  if (!route.feature) return 'any signed-in admin';

  const holders = byFeature[route.feature] ?? {};
  const able = Object.entries(holders)
    .filter(([, perms]) => perms.has(route.permission))
    .map(([role]) => SHORT[role] ?? role);

  if (!able.length) return '—';
  // Everyone but PENDING, which grants nothing anywhere.
  if (able.length >= 5) return 'all roles';
  return able.join(', ');
}

/* ------------------------------------------------------------ sections --- */

const UNITS = [
  {
    key: 'IT',
    band: 'IT UNIT  —  site 101  ·  veltrixair.com',
    intro:
      'Contact enquiries, careers and candidates, insights and discovery bookings. ' +
      'Careers and applications are hard-scoped: a session on another brand is refused ' +
      'outright. Contact, insights and discovery are not — they are shared surfaces ' +
      'filtered by site, so another brand’s admin reaches them and sees only their own rows.',
    modules: [
      ['Contact enquiries', ['public-contact', 'admin-contact']],
      ['Careers', ['public-careers', 'admin-careers']],
      ['Job applications', ['public-applications', 'admin-applications']],
      ['Insights', ['public-insights', 'admin-insights']],
      ['Discovery bookings', ['public-discovery', 'admin-discovery']],
    ],
  },
  {
    key: 'INDUSTRIES',
    band: 'INDUSTRIES UNIT  —  site 102  ·  veltrixairindustries.com',
    intro:
      'Quotes, site visits, and its own careers board with its own application form. ' +
      'Every admin route here is hard-scoped to site 102: a role may grant the feature ' +
      'and still be refused, because the badge is on another brand.',
    modules: [
      ['Quote requests', ['public-crane-quote', 'admin-crane-quote']],
      ['Site visits', ['public-crane-site-visit', 'admin-crane-site-visit']],
      ['Careers', ['public-crane-career', 'admin-crane-career']],
      ['Applications', ['public-crane-application', 'admin-crane-application']],
    ],
  },
  {
    key: 'PRIVACY',
    band: 'PRIVACY UNIT  —  site 103  ·  dataprivacy.veltrixair.com',
    intro:
      'Its own enquiry schema rather than the shared contact table: no NDA, no sales ' +
      'routing, different consent. Hard-scoped to site 103.',
    modules: [['Enquiries', ['public-privacy-contact', 'admin-privacy-contact']]],
  },
];

const COMMON_MODULES = [
  ['Authentication', ['auth']],
  ['Staff administration', ['admin-staff']],
  ['Files', ['admin-files', 'local-files']],
  ['Service', ['app']],
];

function rowsFor(routes, modules, byFeature) {
  const wanted = new Set(modules);
  return routes
    .filter((r) => wanted.has(r.module))
    .sort((a, b) => {
      const pub = (x) => (x.path.startsWith('/admin') ? 1 : 0);
      return pub(a) - pub(b) || a.path.localeCompare(b.path);
    })
    .map((r) => [
      r.method,
      r.path,
      r.summary ?? FALLBACK[`${r.method} ${r.path}`] ?? '—',
      whoReaches(r, byFeature),
    ]);
}

/* ----------------------------------------------------------------- run --- */

(async () => {
  const routes = readRoutes();
  const filled = await fillSummaries(routes);
  const { roles, byFeature } = await readMatrix();

  const publicCount = routes.filter((r) => !r.path.startsWith('/admin')).length;
  const adminCount = routes.length - publicCount;

  const parts = [];

  // --- cover ---------------------------------------------------------------
  parts.push(
    para(run('VeltrixAir — API Reference', { bold: true, size: 16, color: BRAND.IT }), {
      after: 20,
    }),
    para(
      run(
        `Every endpoint in the backend, by unit. ${routes.length} routes — ` +
          `${publicCount} public, ${adminCount} behind a sign-in.`,
        { size: 9, color: MUTED },
      ),
      { after: 70, border: RULE },
    ),
  );

  // --- how to read ---------------------------------------------------------
  parts.push(
    h2('How to read this'),
    para(
      run('Three brands, one backend. ', { bold: true, size: 8.5 }) +
        run(
          'Every scoped row carries a site code — 101 IT, 102 Industries, 103 Privacy. ' +
            'A visitor’s brand is resolved from the domain; an admin’s is signed into their ' +
            'token at login.',
          { size: 8.5, color: MUTED },
        ),
      { after: 26 },
    ),
    para(
      run('One dashboard at a time. ', { bold: true, size: 8.5 }) +
        run(
          'Signing in picks one site and one role. There is no switcher: someone holding ' +
            'badges on two brands signs in twice.',
          { size: 8.5, color: MUTED },
        ),
      { after: 26 },
    ),
    para(
      run('A role can grant something and still be refused. ', { bold: true, size: 8.5 }) +
        run(
          'Roles mean the same on every brand — role_permissions has no site column. So a ' +
            'recruiter holds CRANE_CAREERS everywhere, but a recruiter whose badge is on ' +
            'site 101 gets 403 on the crane board. The “who can reach it” column below names ' +
            'roles; the unit heading tells you where that role has to be standing.',
          { size: 8.5, color: MUTED },
        ),
      { after: 26 },
    ),
    para(
      run('Responses share one envelope. ', { bold: true, size: 8.5 }) +
        run(
          '{ success, statusCode, message, data, timestamp, path, method } — for failures too. ' +
            'Request and response shapes live in Swagger at /api/docs and in the Postman ' +
            'collection; this document is the map, not the contract.',
          { size: 8.5, color: MUTED },
        ),
      { after: 40 },
    ),
  );

  // --- 1 · common ----------------------------------------------------------
  const commonCount = COMMON_MODULES.reduce(
    (n, [, modules]) => n + rowsFor(routes, modules, byFeature).length,
    0,
  );

  parts.push(
    band('COMMON  —  works on all three dashboards', COMMON),
    note(
      `These ${commonCount} routes belong to no brand. Authentication and staff ` +
        'administration behave identically whichever dashboard you signed in to; ' +
        'files are shared and filtered by site.',
    ),
  );
  for (const [title, modules] of COMMON_MODULES) {
    const rows = rowsFor(routes, modules, byFeature);
    if (!rows.length) continue;
    parts.push(h2(title, COMMON), table(rows, COMMON));
  }

  // --- 2-4 · units ---------------------------------------------------------
  for (const unit of UNITS) {
    parts.push(PAGE_BREAK, band(unit.band, BRAND[unit.key]), note(unit.intro));
    for (const [title, modules] of unit.modules) {
      const rows = rowsFor(routes, modules, byFeature);
      if (!rows.length) continue;
      parts.push(h2(title, BRAND[unit.key]), table(rows, BRAND[unit.key]));
    }
  }

  // --- 5 · role reference --------------------------------------------------
  parts.push(PAGE_BREAK, band('ROLE REFERENCE  —  what each role reaches', COMMON));
  parts.push(
    note(
      'The role-first view. Each role means the same thing on every dashboard; where it ' +
        'applies is decided by the badge, and a crane feature only opens on a site-102 session.',
    ),
  );

  for (const role of roles) {
    const held = Object.entries(byFeature)
      .filter(([, holders]) => holders[role.role_name])
      .map(([feature, holders]) => {
        const perms = [...holders[role.role_name]];
        const full = perms.length === 4 ? 'full' : perms.join(', ').toLowerCase();
        return `${feature} — ${full}`;
      })
      .sort();

    parts.push(h2(`${role.role_name}  (${role.role_code})`, COMMON));
    if (!held.length) {
      parts.push(
        para(
          run(
            'Grants nothing at all. A placeholder for someone created but not yet given a ' +
              'job: they can sign in to an empty dashboard, and every guarded route refuses ' +
              'them. Only the organisation-level administrator can hand out SUPER_ADMIN.',
            { size: 8.5, color: MUTED, italic: true },
          ),
          { after: 20, indent: 120 },
        ),
      );
      continue;
    }
    parts.push(
      ...held.map((line) =>
        para(run(`•   ${line}`, { size: 8.5, color: INK }), {
          after: 8,
          indent: 260,
        }),
      ),
    );
  }

  // --- assemble ------------------------------------------------------------
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${parts.join('')}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" ` +
    `w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr>` +
    `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
    `<w:sz w:val="17"/><w:szCs w:val="17"/>` +
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
    `<dc:title>VeltrixAir — API Reference</dc:title>` +
    `<dc:subject>Every endpoint by unit and role</dc:subject>` +
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

  const missing = routes.filter(
    (r) => !r.summary && !FALLBACK[`${r.method} ${r.path}`],
  );
  console.log(`routes:    ${routes.length} (${publicCount} public, ${adminCount} admin)`);
  console.log(`summaries: ${filled} filled from OpenAPI, ${missing.length} still blank`);
  missing.forEach((r) => console.log(`   ${r.method} ${r.path}`));
  console.log(
    `wrote:     ${path.relative(path.join(__dirname, '..'), OUTPUT)}  (${(buffer.length / 1024).toFixed(0)} KB)`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
