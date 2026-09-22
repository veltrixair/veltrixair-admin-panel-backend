/**
 * Builds docs/VeltrixAir-API-By-Role.docx — endpoints grouped by who signs in.
 *
 *   node scripts/build-api-by-role-docx.js
 *
 * The companion to VeltrixAir-API-Reference.docx, which lists each route once
 * with a roles column. This one inverts that: per unit, what a super admin
 * reaches, what each staff role reaches, and what needs no sign-in at all.
 *
 * ROUTES ARE DELIBERATELY REPEATED HERE. A super admin holds every feature, so
 * its list contains everything the staff lists contain. That is the cost of
 * the shape, and the shape is worth it: each section stands alone, so the
 * sales list can be handed to a salesperson without them reading around four
 * other roles to find their own.
 *
 * Sources are the same as the reference document — controllers for paths and
 * permissions, the running server's OpenAPI for summaries built by string
 * concatenation, role_permissions for who reaches what.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUTPUT = path.join(__dirname, '..', 'docs', 'VeltrixAir-API-By-Role.docx');
const BASE = process.env.BASE_URL || 'http://localhost:3000';

/* ------------------------------------------------------------------ zip --- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const def = zlib.deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(def.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, def);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(def.length, 20);
    dir.writeUInt32LE(e.data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += local.length + name.length + def.length;
  }

  const cen = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cen.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, cen, end]);
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

const para = (runs, { before = 0, after = 10, indent = 0, shd, border, keep } = {}) =>
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

const INK = '22252B';
const MUTED = '6B7280';
const RULE = 'D6DAE0';
const COMMON = '3F4650';
const GREEN = '0B6E4F';
const BRAND = { IT: '1F3A5F', INDUSTRIES: '7C4318', PRIVACY: '2C5545', COMMON };

const band = (text, fill) =>
  para(run(`  ${text}`, { bold: true, size: 11.5, color: 'FFFFFF' }), {
    before: 140,
    after: 50,
    shd: fill,
  });

/** "SUPER ADMIN", "STAFF — SALES", "PUBLIC" — the three groups per unit. */
const groupHead = (text, color) =>
  para(run(text, { bold: true, size: 9, color, caps: true }), {
    before: 90,
    after: 8,
    border: RULE,
    keep: true,
  });

const subHead = (text, color) =>
  para(run(text, { bold: true, size: 8.5, color }), {
    before: 60,
    after: 10,
    indent: 100,
    keep: true,
  });

const note = (text) =>
  para(run(text, { size: 8, italic: true, color: MUTED }), {
    before: 12,
    after: 24,
    indent: 100,
  });

/** One endpoint line: verb + path in mono, then the label. */
const endpoint = (r) =>
  para(
    run(`${r.method.padEnd(7)}${r.path}`, { size: 7.5, mono: true, color: INK }) +
      run(`   ${r.summary}`, { size: 7.5, color: MUTED }),
    { after: 4, indent: 200 },
  );

/* -------------------------------------------------------------- routes --- */

const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.controller.ts')) out.push(p);
  }
  return out;
};

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

async function fillSummaries(routes) {
  let spec;
  try {
    spec = await (await fetch(`${BASE}/api/docs-json`)).json();
  } catch {
    console.warn(`! ${BASE} unreachable — a few labels will be blank.`);
    return 0;
  }
  const byKey = {};
  for (const [p, ops] of Object.entries(spec.paths ?? {}))
    for (const [m, op] of Object.entries(ops))
      if (['get', 'post', 'patch', 'put', 'delete'].includes(m))
        byKey[`${m.toUpperCase()} ${p.replace(/\{([^}]+)\}/g, ':$1')}`] = op.summary;

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

const FALLBACK = {
  'GET /': 'Health check — confirms the service is up',
  'GET /files/local/:key': 'Serve an uploaded file in development',
};

const UNAUTHENTICATED = new Set([
  'POST /admin/auth/login',
  'GET /admin/auth/login-options',
  'POST /admin/auth/refresh',
]);

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
  const held = {};
  for (const g of grants) {
    const role = nameOf.get(g.role_code);
    held[role] ??= new Set();
    held[role].add(`${g.feature_name}:${g.permission_name}`);
  }
  return { roles, held };
}

const reaches = (role, held, route) => {
  if (!route.feature) return false;
  return (held[role] ?? new Set()).has(`${route.feature}:${route.permission}`);
};

/* --------------------------------------------------------------- units --- */

const UNITS = [
  {
    key: 'COMMON',
    band: 'COMMON  —  works on all three dashboards',
    note:
      'These belong to no brand. Authentication and staff administration behave ' +
      'identically whichever dashboard you signed in to; files are shared and ' +
      'filtered by site.',
    modules: ['auth', 'admin-staff', 'admin-files', 'local-files', 'app'],
  },
  {
    key: 'IT',
    band: 'IT UNIT  —  site 101  ·  veltrixair.com',
    note:
      'Careers and applications are hard-scoped: a session on another brand is ' +
      'refused outright. Contact, insights and discovery are not — they are shared ' +
      'surfaces filtered by site, so another brand’s admin reaches them and sees ' +
      'only their own rows.',
    modules: [
      'public-contact',
      'admin-contact',
      'public-careers',
      'admin-careers',
      'public-applications',
      'admin-applications',
      'public-insights',
      'admin-insights',
      'public-discovery',
      'admin-discovery',
    ],
  },
  {
    key: 'INDUSTRIES',
    band: 'INDUSTRIES UNIT  —  site 102  ·  veltrixairindustries.com',
    note:
      'Every admin route here is hard-scoped to site 102. A role may grant the ' +
      'feature and still be refused, because the badge is on another brand.',
    modules: [
      'public-crane-quote',
      'admin-crane-quote',
      'public-crane-site-visit',
      'admin-crane-site-visit',
      'public-crane-career',
      'admin-crane-career',
      'public-crane-application',
      'admin-crane-application',
    ],
  },
  {
    key: 'PRIVACY',
    band: 'PRIVACY UNIT  —  site 103  ·  dataprivacy.veltrixair.com',
    note:
      'Its own enquiry schema rather than the shared contact table: no NDA, no ' +
      'sales routing, different consent. Hard-scoped to site 103.',
    modules: ['public-privacy-contact', 'admin-privacy-contact'],
  },
];

/* ----------------------------------------------------------------- run --- */

(async () => {
  const routes = readRoutes();
  const filled = await fillSummaries(routes);
  const { roles, held } = await readMatrix();

  for (const r of routes) r.summary ??= FALLBACK[`${r.method} ${r.path}`] ?? '—';

  const STAFF_ROLES = roles
    .filter((r) => r.role_name !== 'SUPER_ADMIN')
    .map((r) => r.role_name);

  const parts = [
    para(run('VeltrixAir — API by Role', { bold: true, size: 16, color: BRAND.IT }), {
      after: 18,
    }),
    para(
      run(
        'What each kind of user can reach, per unit. Endpoints appear more than once — ' +
          'a super admin holds every feature, so its list contains the staff lists. That ' +
          'is deliberate: each section stands alone.',
        { size: 8.5, color: MUTED },
      ),
      { after: 60, border: RULE },
    ),
    para(
      run('Roles are the same everywhere. ', { bold: true, size: 8.5 }) +
        run(
          'role_permissions has no site column, so a recruiter holds the crane careers ' +
            'feature on paper wherever they are. What decides whether it opens is the badge: ' +
            'a recruiter on site 101 gets 403 on the crane board. A role listed under one ' +
            'unit means "this role, signed in to this unit".',
          { size: 8.5, color: MUTED },
        ),
      { after: 20 },
    ),
    para(
      run('The full route list, once each, is in ', { size: 8.5, color: MUTED }) +
        run('VeltrixAir-API-Reference.docx', { size: 8.5, bold: true, color: INK }) +
        run('. Request and response shapes are in Swagger at /api/docs.', {
          size: 8.5,
          color: MUTED,
        }),
      { after: 40 },
    ),
  ];

  const counts = { superAdmin: 0, staff: 0, public: 0 };

  for (const unit of UNITS) {
    const mine = routes.filter((r) => unit.modules.includes(r.module));
    if (!mine.length) continue;

    parts.push(unit.key === 'COMMON' ? '' : PAGE_BREAK);
    parts.push(band(unit.band, BRAND[unit.key]), note(unit.note));

    const admin = mine.filter((r) => r.path.startsWith('/admin'));
    const open = mine.filter(
      (r) => !r.path.startsWith('/admin') || UNAUTHENTICATED.has(`${r.method} ${r.path}`),
    );

    // --- super admin -------------------------------------------------------
    const superRoutes = admin.filter(
      (r) => !UNAUTHENTICATED.has(`${r.method} ${r.path}`),
    );
    parts.push(groupHead('Super admin', BRAND[unit.key]));
    parts.push(
      note(
        `Everything below, ${superRoutes.length} endpoints. SUPER_ADMIN holds all twelve ` +
          'features, so nothing on this unit is closed to it — on the dashboard it is ' +
          'signed in to.',
      ),
    );
    superRoutes.forEach((r) => parts.push(endpoint(r)));
    counts.superAdmin += superRoutes.length;

    // --- staff, by role ----------------------------------------------------
    parts.push(groupHead('Staff', BRAND[unit.key]));
    let anyStaff = false;
    for (const role of STAFF_ROLES) {
      const theirs = superRoutes.filter((r) => reaches(role, held, r));
      if (!theirs.length) continue;
      anyStaff = true;
      parts.push(subHead(`${role}  —  ${theirs.length} endpoints`, INK));
      theirs.forEach((r) => parts.push(endpoint(r)));
      counts.staff += theirs.length;
    }
    if (!anyStaff) {
      parts.push(
        note('No staff role reaches anything here — this unit is super-admin only.'),
      );
    }

    // --- public ------------------------------------------------------------
    parts.push(groupHead('Public', GREEN));
    parts.push(note(`No sign-in. ${open.length} endpoints.`));
    open.forEach((r) => parts.push(endpoint(r)));
    counts.public += open.length;
  }

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${parts.join('')}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900"/></w:sectPr>` +
    `</w:body></w:document>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr>` +
    `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
    `<w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:rPrDefault>` +
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
    `<dc:title>VeltrixAir — API by Role</dc:title>` +
    `<dc:subject>Endpoints grouped by unit and by who signs in</dc:subject>` +
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

  console.log(`routes:    ${routes.length} distinct`);
  console.log(`summaries: ${filled} filled from OpenAPI`);
  console.log(
    `listings:  ${counts.superAdmin} super admin + ${counts.staff} staff + ${counts.public} public ` +
      `= ${counts.superAdmin + counts.staff + counts.public} lines`,
  );
  console.log(
    `wrote:     ${path.relative(path.join(__dirname, '..'), OUTPUT)}  (${(buffer.length / 1024).toFixed(0)} KB)`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
