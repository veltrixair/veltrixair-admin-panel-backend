/**
 * Builds docs/VeltrixAir-Production-Deployment.docx — the runbook for taking
 * this project live.
 *
 *   node scripts/build-deployment-docx.js
 *
 * Target architecture, which the document assumes throughout:
 *
 *   - the admin panel (C:\Veltrixair_AdminPanel_FontendCode) built to static
 *     files, served from S3 behind CloudFront
 *   - this backend and PostgreSQL as two containers on one EC2 box
 *   - both reachable on the SAME origin, because CloudFront routes /api/* to
 *     EC2 and everything else to S3
 *   - ONE admin hostname, admin.veltrixair.com, for all three units. The unit
 *     is chosen on the login screen and carried by the token, never by the
 *     hostname — nothing in the frontend reads location.hostname, so this
 *     costs no code.
 *
 * That last point is the load-bearing one. The frontend already calls the API
 * with relative paths — its own .env.example says "Production serves both from
 * one origin" — so a single origin means no CORS, no second certificate, and
 * no frontend change beyond turning the mock auth off.
 *
 * Facts in here were read out of the two codebases rather than assumed:
 * synchronize/migrationsRun are both false (so migrations are a deploy step),
 * the storage driver falls back to LOCAL_STORAGE_DIR when the Supabase keys are
 * absent (so uploads need their own volume), and site_masters already carries
 * the three admin domains.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUTPUT = path.join(
  __dirname,
  '..',
  'docs',
  'VeltrixAir-Production-Deployment.docx',
);

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
    const deflated = zlib.deflateRawSync(entry.data);
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

const run = (text, { bold, italic, color, size = 8.5, caps, mono } = {}) =>
  `<w:r><w:rPr>` +
  (mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : '') +
  (bold ? '<w:b/>' : '') +
  (italic ? '<w:i/>' : '') +
  (caps ? '<w:smallCaps/>' : '') +
  (color ? `<w:color w:val="${color}"/>` : '') +
  `<w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/></w:rPr>` +
  `<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

const para = (
  runs,
  { before = 0, after = 12, indent = 0, shd, border, keep, line = 240 } = {},
) =>
  `<w:p><w:pPr>` +
  `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>` +
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
const NAVY = '1F3A5F';
const RUST = '7C4318';
const GREEN = '2C5545';
const CODE_BG = 'F4F5F7';
const WARN_BG = 'FCF3E8';

/** Section banner — the numbered parts of the runbook. */
const band = (text, fill = NAVY) =>
  para(run(`  ${text}`, { bold: true, size: 12, color: 'FFFFFF' }), {
    before: 180,
    after: 80,
    shd: fill,
  });

const h2 = (text, color = INK) =>
  para(run(text, { bold: true, size: 10, color }), {
    before: 140,
    after: 30,
    keep: true,
  });

const h3 = (text) =>
  para(run(text, { bold: true, size: 8.8, color: NAVY }), {
    before: 100,
    after: 24,
    keep: true,
  });

const p = (text, opts = {}) => para(run(text, { size: 8.5 }), { after: 90, ...opts });

/** Body text with a bold lead-in, for "Why: ..." style lines. */
const pLead = (lead, text) =>
  para(run(lead, { size: 8.5, bold: true }) + run(text, { size: 8.5 }), {
    after: 90,
  });

const note = (text) =>
  para(run(text, { size: 8, italic: true, color: MUTED }), {
    before: 20,
    after: 100,
  });

const bullet = (text) =>
  para(run('\u2022   ', { size: 8.5, color: MUTED }) + run(text, { size: 8.5 }), {
    indent: 220,
    after: 40,
  });

/** A numbered instruction. Kept visually distinct from prose bullets. */
const step = (n, text) =>
  para(
    run(`${n}. `, { size: 8.5, bold: true, color: NAVY }) +
      run(text, { size: 8.5 }),
    { indent: 220, after: 50 },
  );

/** Shaded monospace block. One paragraph per line so long lines never wrap. */
const code = (text) => {
  const lines = String(text).replace(/\t/g, '  ').split('\n');
  return lines
    .map((l, i) =>
      para(run(l === '' ? ' ' : l, { mono: true, size: 7.6 }), {
        before: i === 0 ? 40 : 0,
        after: i === lines.length - 1 ? 100 : 0,
        line: 200,
        indent: 160,
        shd: CODE_BG,
      }),
    )
    .join('');
};

/** Boxed caution. Used sparingly — only where getting it wrong is expensive. */
const warn = (title, text) =>
  para(run(`  ${title}  `, { bold: true, size: 8.4, color: RUST }), {
    before: 110,
    after: 0,
    shd: WARN_BG,
  }) +
  para(run(`  ${text}`, { size: 8.3, color: INK }), {
    before: 0,
    after: 110,
    shd: WARN_BG,
  });

/* --------------------------------------------------------------- table --- */

const cell = (text, { bold, width, fill, align = 'left', color = INK, mono } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
  (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '') +
  `<w:vAlign w:val="center"/></w:tcPr>` +
  `<w:p><w:pPr><w:spacing w:before="24" w:after="24" w:line="200" w:lineRule="auto"/>` +
  `<w:jc w:val="${align}"/></w:pPr>` +
  run(text, { bold, size: 7.6, color, mono }) +
  `</w:p></w:tc>`;

/**
 * @param headers  column titles
 * @param rows     array of string arrays
 * @param widths   twips, must sum to 8000
 * @param monoCols indices rendered in Consolas
 */
function table(headers, rows, widths, { monoCols = [], headFill = NAVY } = {}) {
  const head =
    '<w:tr><w:trPr><w:tblHeader/></w:trPr>' +
    headers
      .map((h, i) =>
        cell(h, { bold: true, width: widths[i], fill: headFill, color: 'FFFFFF' }),
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
              mono: monoCols.includes(i),
              fill: r % 2 ? 'F5F6F8' : undefined,
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
    '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>' +
    '</w:tblPr>' +
    head +
    body +
    '</w:tbl>'
  );
}

/* ======================================================== the document === */

const parts = [];
const add = (...x) => parts.push(...x);

/* ---------------------------------------------------------------- cover -- */

add(
  para(run('VELTRIXAIR', { bold: true, size: 22, color: NAVY }), {
    before: 900,
    after: 20,
  }),
  para(run('Production Deployment Runbook', { size: 15, color: INK }), {
    after: 60,
  }),
  para(
    run(
      'admin.veltrixair.com on S3 behind CloudFront \u00b7 backend and PostgreSQL in Docker on EC2 \u00b7 DNS at Hostinger',
      { size: 9, color: MUTED },
    ),
    { after: 240, border: RULE },
  ),
  p(
    'Every step required to take veltrixair.com from local development to production, in the order it has to happen. Written against the two codebases as they stand, not a generic template — the file paths, commands and environment variables here are the real ones.',
  ),
  h2('What this covers'),
  bullet('One admin hostname for all three units, served from S3 behind CloudFront'),
  bullet('This backend and PostgreSQL as two containers on a single EC2 instance'),
  bullet('The database directory mounted from the host, so data survives every container rebuild'),
  bullet('Nightly dumps kept on the host and copied off-box to S3'),
  bullet('DNS at Hostinger, TLS from AWS Certificate Manager'),
  h2('Codebases referenced'),
  code(
    'backend    C:\\VELTRIXAIR.COM-Backend\n' +
      'frontend   C:\\Veltrixair_AdminPanel_FontendCode',
  ),
  note(
    'Generated by scripts/build-deployment-docx.js. Re-run it after changing the deployment shape rather than editing the .docx by hand.',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------------ 1 architecture --- */

add(
  band('1  \u00b7  WHAT YOU ARE BUILDING'),
  p(
    'One CloudFront distribution sits in front of everything. It serves the admin panel from S3 by default, and forwards anything under /api/ to the EC2 box. From the browser\u2019s point of view there is a single origin.',
  ),
  code(
    '                                                                             \n' +
      '  admin.veltrixair.com  --->  CloudFront  ---+--- default  --->  S3 bucket  \n' +
      '   (all three units)                        |                  (the SPA)   \n' +
      '                                            |                              \n' +
      '                                            +--- /api/*    --->  EC2 :443  \n' +
      '                                                                 nginx     \n' +
      '                                                                   |       \n' +
      '                                          +------------------------+       \n' +
      '                                          |  Docker network                \n' +
      '                                          |                                \n' +
      '                                          +--> api        :3000            \n' +
      '                                          +--> postgres   :5432            \n' +
      '                                                 |                          \n' +
      '                                                 +-- /opt/veltrixair/data   \n' +
      '                                                     (host volume)          ',
  ),
  h2('Why a single origin, and not a separate api. subdomain'),
  p(
    'The frontend already calls the API with relative paths. Its own .env.example states the intent: "Dev server proxies /api to this. Production serves both from one origin." Keeping that promise removes three problems at once.',
  ),
  bullet('No CORS. CORS_ORIGINS stays empty, and there is no preflight to misconfigure.'),
  bullet('No second certificate, and no second DNS name to keep in step.'),
  bullet('No mixed-content class of bug — everything is HTTPS on one host.'),
  p(
    'A separate api.veltrixair.com works too, but it costs a CORS allowlist, another certificate, and a change to the frontend so it targets an absolute URL. There is no benefit here that pays for that.',
  ),
  h2('One hostname, three units'),
  p(
    'Everybody goes to admin.veltrixair.com. The login screen offers the three dashboards, the person picks one and signs in, and the token is issued for that unit. A crane administrator and a privacy administrator use the same URL and see entirely different dashboards.',
  ),
  p(
    'This costs nothing to build, because the brand was never derived from the hostname in the first place. The login request already carries siteCode and roleCode, resolveScope validates the badge against a live row, and the unit is signed into the token. Nothing in the frontend reads location.hostname — the picker in src/lib/site.ts is a static list of the three, and everything after sign-in reads scope from the session.',
  ),
  h2('Which means the session model does the work'),
  bullet('Someone who holds badges on two units signs out and back in to switch — the scope is fixed at sign-in and cannot widen.'),
  bullet('Someone who holds one badge sees the other dashboards on the picker and is refused if they choose one, with a message naming what they do hold.'),
  bullet('The token, not the URL, is the boundary. A single hostname changes nothing about that.'),
  h2('A database change this does require'),
  p(
    'site_masters.admin_domain currently holds three separate hostnames, and login returns it — the profile screen displays it as "where this dashboard is served from". With one hostname all three rows should say so:',
  ),
  code(
    "UPDATE site_masters SET admin_domain = 'admin.veltrixair.com'\n" +
      ' WHERE site_code IN (101, 102, 103);',
  ),
  table(
    ['Site', 'admin_domain (after)', 'Public site (unchanged)'],
    [
      ['101  Veltrixair IT', 'admin.veltrixair.com', 'veltrixair.com'],
      ['102  Veltrixair Industries', 'admin.veltrixair.com', 'veltrixairindustries.com'],
      ['103  Veltrixair Privacy', 'admin.veltrixair.com', 'dataprivacy.veltrixair.com'],
    ],
    [2400, 2700, 2900],
    { monoCols: [1, 2] },
  ),
  note(
    'Leaving the old values in place is not dangerous — nothing redirects to admin_domain — but the profile screen would tell a crane administrator their dashboard lives at crane.veltrixair.com, which is a support ticket waiting to happen.',
  ),
  PAGE_BREAK,
);

/* ---------------------------------------------------------- 2 before ----- */

add(
  band('2  \u00b7  BEFORE YOU START'),
  h2('Accounts and access'),
  bullet('An AWS account with permission to create EC2, S3, CloudFront, ACM and IAM resources'),
  bullet('Access to the Hostinger control panel for veltrixair.com, specifically the DNS zone editor'),
  bullet('The current Supabase project, if you are moving existing data across'),
  h2('Tools on your machine'),
  code(
    'aws --version        # AWS CLI v2\n' +
      'node --version       # 20 or newer\n' +
      'docker --version     # only needed if you want to test the image locally\n' +
      'ssh -V               # OpenSSH, for reaching the EC2 box',
  ),
  h2('Decisions to make now'),
  table(
    ['Decision', 'Recommended', 'Why'],
    [
      ['AWS region', 'me-central-1 (UAE)', 'Closest to Riyadh and Dubai users'],
      ['Instance type', 't3.small (2 vCPU, 2 GB)', 'Fits API + Postgres; t3.micro is too tight'],
      ['Root volume', '30 GB gp3', 'Database, uploads and backups all live here'],
      ['Certificate region', 'us-east-1', 'CloudFront reads certificates only from there'],
      ['Admin hostname', 'admin.veltrixair.com', 'One for all three units'],
      ['Origin hostname', 'origin.veltrixair.com', 'The EC2 box. Users never type it.'],
    ],
    [1800, 2300, 3900],
  ),
  warn(
    'The certificate region is not a preference.',
    'CloudFront ignores certificates in every region except us-east-1. Request it there even though the instance lives elsewhere.',
  ),
  h2('Secrets to generate'),
  p(
    'Generate these now and store them where the team can find them again. Do not reuse the development values — config/dev.env is in the repository history.',
  ),
  code(
    'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"   # ADMIN_JWT_SECRET\n' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"        # IP_PEPPER\n' +
      'node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'base64url\'))"   # POSTGRES_PASSWORD',
  ),
  warn(
    'IP_PEPPER can never be rotated casually.',
    'Every ip_hash already stored was computed with it. Change it later and old hashes stop matching new ones — the spam-check history becomes unreadable. Pick it once.',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------------- 3 code changes -- */

add(
  band('3  \u00b7  CODE CHANGES', RUST),
  p(
    'Seven files. Do these first, locally, and commit them — the EC2 steps assume the repository already contains them.',
  ),

  h2('3.1   src/main.ts   \u2014  trust the proxy'),
  p(
    'This one is not optional, and it fails in a way that looks like something else entirely.',
  ),
  p(
    'Behind CloudFront, req.ip is the edge server\u2019s address rather than the visitor\u2019s. The login route is throttled to five requests per minute per IP, so every user arriving through the same edge shares one bucket. A handful of people signing in together start getting 429s, and it reads as an outage.',
  ),
  p('Add this immediately after the app is created:'),
  code(
    "// Behind CloudFront and nginx, the socket address is the proxy's. Without\n" +
      '// this, express reports the edge IP as the client — which would make the\n' +
      '// login throttle a shared bucket, and ip_hash a hash of CloudFront.\n' +
      "app.getHttpAdapter().getInstance().set('trust proxy', 1);",
  ),
  note(
    'It also fixes the spam-check ip_hash, which is currently hashing the proxy rather than the submitter.',
  ),

  h2('3.2   config/prod.env   \u2014  new file, never committed'),
  p(
    'data-source.ts reads config/prod.env whenever NODE_ENV is production. Create it on the EC2 box, not in the repository.',
  ),
  code(
    'NODE_ENV=production\n' +
      'PORT=3000\n' +
      '\n' +
      '# The database container, reachable by its compose service name.\n' +
      'DB_HOST=postgres\n' +
      'DB_PORT=5432\n' +
      'DB_USERNAME=veltrixair\n' +
      'DB_PASSWORD=<the POSTGRES_PASSWORD you generated>\n' +
      'DB_NAME=veltrixair\n' +
      '# Off deliberately: this hop never leaves the Docker network.\n' +
      'DB_SSL=false\n' +
      '\n' +
      '# Empty on purpose. CloudFront serves the panel and the API from one\n' +
      '# origin, so no cross-origin request is ever made.\n' +
      'CORS_ORIGINS=\n' +
      '\n' +
      'THROTTLE_TTL=60000\n' +
      'THROTTLE_LIMIT=100\n' +
      'PRIVACY_NOTICE_VERSION=1.0\n' +
      'IP_PEPPER=<generated>\n' +
      '\n' +
      'ADMIN_JWT_SECRET=<generated>\n' +
      'ADMIN_ACCESS_TOKEN_TTL=15m\n' +
      'ADMIN_REFRESH_TOKEN_TTL_DAYS=7\n' +
      '\n' +
      '# No SUPABASE_* keys, so the storage provider falls back to local disk.\n' +
      '# This path is a mounted volume — see section 5.\n' +
      'LOCAL_STORAGE_DIR=/app/storage\n' +
      'SIGNED_URL_TTL_SECONDS=300\n' +
      'SCAN_REQUIRED=false\n' +
      '\n' +
      'MAIL_FROM=no-reply@veltrixair.com',
  ),
  warn(
    'Dropping the Supabase keys moves file storage to local disk.',
    'files.module.ts picks the Supabase driver only when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both set, and falls back to LOCAL_STORAGE_DIR otherwise. That directory must be a mounted volume or every CV and onboarding document is lost on the next rebuild. If you would rather keep Supabase Storage, leave the three SUPABASE_ variables in and skip the storage volume.',
  ),

  h2('3.3   Dockerfile   \u2014  new file'),
  code(
    '# ---- build ----------------------------------------------------------\n' +
      'FROM node:20-alpine AS build\n' +
      'WORKDIR /app\n' +
      '\n' +
      '# Copy manifests first so a source-only change reuses the install layer.\n' +
      'COPY package*.json ./\n' +
      'RUN npm ci\n' +
      '\n' +
      'COPY . .\n' +
      'RUN npm run build\n' +
      '\n' +
      '# ---- run ------------------------------------------------------------\n' +
      'FROM node:20-alpine AS run\n' +
      'WORKDIR /app\n' +
      'ENV NODE_ENV=production\n' +
      '\n' +
      '# Production dependencies only — the build toolchain stays behind.\n' +
      'COPY package*.json ./\n' +
      'RUN npm ci --omit=dev\n' +
      '\n' +
      'COPY --from=build /app/dist ./dist\n' +
      '\n' +
      '# Migrations run from source through ts-node, so these come along too.\n' +
      'COPY --from=build /app/src ./src\n' +
      'COPY tsconfig*.json ./\n' +
      '\n' +
      '# The storage volume mounts here; create it so the first write cannot fail.\n' +
      'RUN mkdir -p /app/storage && chown -R node:node /app/storage\n' +
      'USER node\n' +
      '\n' +
      'EXPOSE 3000\n' +
      'CMD ["node", "dist/main"]',
  ),
  note(
    'src and tsconfig are copied into the runtime image on purpose: migration:run uses typeorm-ts-node-commonjs against src/data-source.ts, so a dist-only image cannot migrate itself.',
  ),

  h2('3.4   .dockerignore   \u2014  new file'),
  code(
    'node_modules\n' +
      'dist\n' +
      '.git\n' +
      '.github\n' +
      'docs\n' +
      'storage\n' +
      'config/*.env\n' +
      '*.log',
  ),
  warn(
    'config/*.env matters.',
    'Without that line your development database password and JWT secret are baked into the image layers, readable by anyone who can pull it.',
  ),

  h2('3.5   docker-compose.yml   \u2014  new file'),
  code(
    'services:\n' +
      '  postgres:\n' +
      '    image: postgres:16-alpine\n' +
      '    restart: unless-stopped\n' +
      '    environment:\n' +
      '      POSTGRES_USER: veltrixair\n' +
      '      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}\n' +
      '      POSTGRES_DB: veltrixair\n' +
      '    volumes:\n' +
      '      # Host bind mount. The database lives on the EC2 disk, not inside\n' +
      '      # the container, so rebuilding the container never touches data.\n' +
      '      - /opt/veltrixair/data/postgres:/var/lib/postgresql/data\n' +
      '      - /opt/veltrixair/backups:/backups\n' +
      '    healthcheck:\n' +
      '      test: ["CMD-SHELL", "pg_isready -U veltrixair -d veltrixair"]\n' +
      '      interval: 10s\n' +
      '      timeout: 5s\n' +
      '      retries: 5\n' +
      '    # No ports section on purpose: Postgres is reachable only from the\n' +
      '    # compose network, never from the internet.\n' +
      '\n' +
      '  api:\n' +
      '    build: .\n' +
      '    restart: unless-stopped\n' +
      '    depends_on:\n' +
      '      postgres:\n' +
      '        condition: service_healthy\n' +
      '    env_file:\n' +
      '      - ./config/prod.env\n' +
      '    volumes:\n' +
      '      - /opt/veltrixair/data/storage:/app/storage\n' +
      '    ports:\n' +
      '      # Bound to loopback: only nginx on this host can reach it.\n' +
      '      - "127.0.0.1:3000:3000"',
  ),

  h2('3.6   deploy/nginx.conf   \u2014  new file'),
  p(
    'The frontend calls /api/admin/auth/login. The backend serves /admin/auth/login — it sets no global prefix. Vite\u2019s dev proxy strips /api; in production nginx does it.',
  ),
  code(
    'server {\n' +
      '    listen 443 ssl http2;\n' +
      '    server_name origin.veltrixair.com;\n' +
      '\n' +
      '    ssl_certificate     /etc/letsencrypt/live/origin.veltrixair.com/fullchain.pem;\n' +
      '    ssl_certificate_key /etc/letsencrypt/live/origin.veltrixair.com/privkey.pem;\n' +
      '\n' +
      '    # 20 MB: the CV upload limit is 5 MB, with headroom for multipart.\n' +
      '    client_max_body_size 20m;\n' +
      '\n' +
      '    location /api/ {\n' +
      '        # The trailing slash on proxy_pass is what strips /api.\n' +
      '        # Without it every route 404s.\n' +
      '        proxy_pass http://127.0.0.1:3000/;\n' +
      '\n' +
      '        proxy_set_header Host              $host;\n' +
      '        proxy_set_header X-Real-IP         $remote_addr;\n' +
      '        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;\n' +
      '        proxy_set_header X-Forwarded-Proto $scheme;\n' +
      '    }\n' +
      '\n' +
      '    location / { return 404; }\n' +
      '}\n' +
      '\n' +
      'server {\n' +
      '    listen 80;\n' +
      '    server_name origin.veltrixair.com;\n' +
      '    return 301 https://$host$request_uri;\n' +
      '}',
  ),
  warn(
    'The trailing slash is the whole trick.',
    'proxy_pass http://127.0.0.1:3000/ strips the /api/ prefix. proxy_pass http://127.0.0.1:3000 (no slash) forwards it intact, and every single route returns 404. This is the most common way this deployment goes wrong.',
  ),
  p(
    'X-Forwarded-For is what makes the trust proxy setting in 3.1 work. The two changes only function as a pair.',
  ),

  h2('3.7   .env.production   \u2014  in the frontend repository'),
  code(
    '# Real API, not fixtures.\n' +
      'VITE_USE_MOCK_AUTH=0',
  ),
  p(
    'No API URL is needed, because the paths stay relative. VITE_DEV_SITE_CODE must be left out — the X-Site-Code header is development scaffolding and the backend ignores it for authenticated requests.',
  ),

  h2('3.8   src/lib/site.ts   —  the picker labels'),
  p(
    'The three cards on the login screen carry a subtitle naming a domain that will no longer exist:',
  ),
  code(
    "shortDomain: 'dp.veltrixair'     ->  'Privacy unit'\n" +
      "shortDomain: 'crane.veltrixair'  ->  'Crane unit'\n" +
      "shortDomain: 'it.veltrixair'     ->  'IT unit'",
  ),
  p(
    'Cosmetic, and the only place the old subdomains survive in the frontend. Nothing reads location.hostname, so the single-domain change needs no logic anywhere — this is a label edit, not a refactor.',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------------------- 4 EC2 ----- */

add(
  band('4  \u00b7  THE EC2 INSTANCE'),
  h3('4.1   Launch it'),
  step(1, 'EC2 console \u2192 Launch instance. Name it veltrixair-prod.'),
  step(2, 'AMI: Ubuntu Server 24.04 LTS (64-bit x86).'),
  step(3, 'Instance type: t3.small.'),
  step(4, 'Key pair: create a new one, download the .pem, and keep it safe — it cannot be downloaded twice.'),
  step(5, 'Storage: change the root volume to 30 GB gp3.'),
  step(6, 'Launch.'),
  h3('4.2   Security group'),
  p('Three inbound rules, and no more:'),
  table(
    ['Port', 'Source', 'Purpose'],
    [
      ['22', 'My IP', 'SSH. Never 0.0.0.0/0.'],
      ['80', '0.0.0.0/0', 'HTTP, only so certbot can validate and redirect'],
      ['443', '0.0.0.0/0', 'HTTPS from CloudFront'],
    ],
    [1000, 2000, 5000],
    { monoCols: [0, 1] },
  ),
  note(
    'Port 5432 is deliberately absent. Postgres has no ports mapping in compose either, so it is reachable only from inside the Docker network — two independent reasons the database is not exposed.',
  ),
  p(
    'Once everything works, tighten port 443 to the com.amazonaws.global.cloudfront.origin-facing managed prefix list. That stops anyone reaching the origin directly and bypassing CloudFront.',
  ),
  h3('4.3   Elastic IP'),
  p(
    'Allocate an Elastic IP and associate it with the instance. Without one the public address changes on every stop/start, and both DNS and the certificate would break.',
  ),
  h3('4.4   Install Docker'),
  code(
    'ssh -i veltrixair-prod.pem ubuntu@<elastic-ip>\n' +
      '\n' +
      'sudo apt update && sudo apt upgrade -y\n' +
      'sudo apt install -y ca-certificates curl gnupg git\n' +
      '\n' +
      'sudo install -m 0755 -d /etc/apt/keyrings\n' +
      'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \\\n' +
      '  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg\n' +
      'sudo chmod a+r /etc/apt/keyrings/docker.gpg\n' +
      '\n' +
      'echo "deb [arch=$(dpkg --print-architecture) \\\n' +
      '  signed-by=/etc/apt/keyrings/docker.gpg] \\\n' +
      '  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \\\n' +
      '  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null\n' +
      '\n' +
      'sudo apt update\n' +
      'sudo apt install -y docker-ce docker-ce-cli containerd.io \\\n' +
      '  docker-buildx-plugin docker-compose-plugin\n' +
      '\n' +
      '# Run docker without sudo. Log out and back in for this to take effect.\n' +
      'sudo usermod -aG docker ubuntu\n' +
      '\n' +
      'docker --version && docker compose version',
  ),
  PAGE_BREAK,
);

/* -------------------------------------------------- 5 postgres + volume -- */

add(
  band('5  \u00b7  POSTGRESQL WITH A HOST VOLUME', GREEN),
  h2('The layout on the host'),
  p(
    'Everything that must outlive a container lives under one directory, which makes both backup and disaster recovery a single path to reason about.',
  ),
  code(
    '/opt/veltrixair/\n' +
      '  |\n' +
      '  +-- app/                  the git checkout (code, Dockerfile, compose)\n' +
      '  |     +-- config/prod.env\n' +
      '  |\n' +
      '  +-- data/\n' +
      '  |     +-- postgres/       the live database files\n' +
      '  |     +-- storage/        uploaded CVs, onboarding documents, payslips\n' +
      '  |\n' +
      '  +-- backups/              nightly dumps, kept 14 days',
  ),
  h2('Why a bind mount rather than a named volume'),
  p(
    'A named Docker volume would work, but it lives under /var/lib/docker and is awkward to inspect, copy or hand to a backup script. A bind mount is an ordinary directory: you can ls it, tar it, and know exactly what you are protecting.',
  ),
  h3('5.1   Create the directories'),
  code(
    'sudo mkdir -p /opt/veltrixair/{app,data/postgres,data/storage,backups}\n' +
      'sudo chown -R ubuntu:ubuntu /opt/veltrixair\n' +
      '\n' +
      '# The postgres image runs as uid 999 and writes to this directory itself.\n' +
      'sudo chown -R 999:999 /opt/veltrixair/data/postgres\n' +
      '\n' +
      '# The api image runs as the node user, uid 1000.\n' +
      'sudo chown -R 1000:1000 /opt/veltrixair/data/storage',
  ),
  warn(
    'Ownership is the usual reason the database container will not start.',
    'Postgres refuses to initialise a data directory it does not own, and the error ("could not create lock file", "permission denied") does not mention ownership at all. Set 999:999 before the first start.',
  ),
  h3('5.2   Get the code onto the box'),
  code(
    'cd /opt/veltrixair/app\n' +
      'git clone <your-repository-url> .\n' +
      'git checkout main\n' +
      '\n' +
      '# Create config/prod.env from section 3.2, then lock it down.\n' +
      'nano config/prod.env\n' +
      'chmod 600 config/prod.env\n' +
      '\n' +
      '# Compose reads POSTGRES_PASSWORD from here.\n' +
      'echo "POSTGRES_PASSWORD=<the same password as DB_PASSWORD>" > .env\n' +
      'chmod 600 .env',
  ),
  note(
    'DB_PASSWORD in config/prod.env and POSTGRES_PASSWORD in .env must match. They are the same credential read by two different processes.',
  ),
  h3('5.3   Start the database on its own first'),
  code(
    'cd /opt/veltrixair/app\n' +
      'docker compose up -d postgres\n' +
      '\n' +
      '# Wait for the healthcheck to report healthy.\n' +
      'docker compose ps\n' +
      '\n' +
      'docker compose logs postgres | tail -20',
  ),
  p('Confirm the data actually landed on the host, not inside the container:'),
  code(
    'ls -la /opt/veltrixair/data/postgres\n' +
      '# Expect PG_VERSION, base/, global/, pg_wal/ and friends.',
  ),
  p(
    'If that directory is empty, the mount is wrong and you are about to lose everything you put in. Stop and fix it before going further.',
  ),
  h3('5.4   Prove the volume survives the container'),
  p('Worth doing once, now, while there is nothing to lose:'),
  code(
    'docker compose exec postgres psql -U veltrixair -d veltrixair \\\n' +
      '  -c "CREATE TABLE volume_probe (note text); \\\n' +
      '      INSERT INTO volume_probe VALUES (\'survived\');"\n' +
      '\n' +
      '# Destroy the container. Note: no -v flag.\n' +
      'docker compose rm -sf postgres\n' +
      'docker compose up -d postgres\n' +
      '\n' +
      'docker compose exec postgres psql -U veltrixair -d veltrixair \\\n' +
      '  -c "SELECT * FROM volume_probe;"\n' +
      '# -> survived\n' +
      '\n' +
      'docker compose exec postgres psql -U veltrixair -d veltrixair \\\n' +
      '  -c "DROP TABLE volume_probe;"',
  ),
  warn(
    'Never run docker compose down -v on this host.',
    'The -v flag removes volumes. On a bind mount it will not delete the host directory, but the habit is fatal the day any part of this runs on a named volume. Use docker compose down, or docker compose restart.',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------------- 6 data move ----- */

add(
  band('6  \u00b7  MOVING THE DATA ACROSS', GREEN),
  p(
    'Skip this section entirely if you are starting production empty — go to 6.4 and run the migrations against a fresh database instead.',
  ),
  h3('6.1   Dump from Supabase'),
  p('Run this from your machine, where the Supabase credentials already work:'),
  code(
    'pg_dump \\\n' +
      '  --host=db.<project-ref>.supabase.co \\\n' +
      '  --port=5432 \\\n' +
      '  --username=postgres \\\n' +
      '  --dbname=postgres \\\n' +
      '  --no-owner --no-privileges \\\n' +
      '  --format=custom \\\n' +
      '  --file=veltrixair-$(date +%Y%m%d).dump',
  ),
  p(
    '--no-owner and --no-privileges matter: the Supabase roles do not exist on your own Postgres, and without these flags the restore fails on every GRANT.',
  ),
  h3('6.2   Copy it to the instance'),
  code(
    'scp -i veltrixair-prod.pem veltrixair-*.dump \\\n' +
      '    ubuntu@<elastic-ip>:/opt/veltrixair/backups/',
  ),
  h3('6.3   Restore into the container'),
  code(
    '# /backups is already mounted into the postgres container.\n' +
      'docker compose exec postgres pg_restore \\\n' +
      '  --username=veltrixair \\\n' +
      '  --dbname=veltrixair \\\n' +
      '  --no-owner --no-privileges \\\n' +
      '  --verbose \\\n' +
      '  /backups/veltrixair-<date>.dump',
  ),
  note(
    'Some errors about extensions Supabase installs and you do not need (pgsodium, supabase_vault) are expected and harmless. Errors mentioning your own tables are not.',
  ),
  h3('6.4   Run the migrations'),
  p(
    'The application never migrates itself. database.config.ts sets synchronize: false and migrationsRun: false, so schema changes are always a deliberate step — which is what you want on a database holding customer records.',
  ),
  code(
    'docker compose run --rm api npm run migration:run\n' +
      '\n' +
      '# Confirm nothing is left pending.\n' +
      'docker compose run --rm api npm run migration:show',
  ),
  h3('6.5   Verify the row counts'),
  code(
    "docker compose exec postgres psql -U veltrixair -d veltrixair -c \"\n" +
      "  SELECT 'admins' t, count(*) FROM admins\n" +
      "  UNION ALL SELECT 'employees', count(*) FROM employees\n" +
      "  UNION ALL SELECT 'crane_quotes', count(*) FROM crane_quotes\n" +
      "  UNION ALL SELECT 'discovery_bookings', count(*) FROM discovery_bookings\n" +
      "  UNION ALL SELECT 'site_masters', count(*) FROM site_masters;\"",
  ),
  h3('6.6   The files are a separate migration'),
  warn(
    'A database dump does not carry Supabase Storage.',
    'Uploaded CVs and onboarding documents live in the Supabase bucket, not in Postgres — the tables only hold references. If you are dropping the SUPABASE_ keys, download the bucket and copy it into /opt/veltrixair/data/storage, or those references point at nothing. Keeping Supabase Storage is a legitimate alternative: leave the three variables in config/prod.env and this problem disappears.',
  ),
  h3('6.7   First administrator, on an empty database'),
  code('docker compose run --rm api npm run admin:create'),

  h3('6.8   Point all three dashboards at the single hostname'),
  p(
    'Whether the data was restored or started empty, the seeded admin_domain values name three subdomains that will not exist. Login returns this field and the profile screen displays it.',
  ),
  code(
    'docker compose exec postgres psql -U veltrixair -d veltrixair -c "\n' +
      "  UPDATE site_masters SET admin_domain = 'admin.veltrixair.com'\n" +
      '   WHERE site_code IN (101, 102, 103);"\n' +
      '\n' +
      'docker compose exec postgres psql -U veltrixair -d veltrixair -c "\n' +
      '  SELECT site_code, site_name, admin_domain FROM site_masters ORDER BY site_code;"',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------------- 7 backend up ---- */

add(
  band('7  \u00b7  THE BACKEND CONTAINER'),
  h3('7.1   Build and start'),
  code(
    'cd /opt/veltrixair/app\n' +
      'docker compose build api\n' +
      'docker compose up -d\n' +
      '\n' +
      'docker compose ps\n' +
      'docker compose logs -f api',
  ),
  p('Look for the two lines the application prints on a healthy boot:'),
  code(
    'Nest application successfully started\n' +
      'Veltrixair.com backend running on port 3000',
  ),
  h3('7.2   Check it from the box itself'),
  code(
    '# Public route, no authentication needed.\n' +
      'curl -s -H "X-Site-Code: 101" http://127.0.0.1:3000/discovery/practices | head -c 300\n' +
      '\n' +
      '# Should list five roles, and not PENDING.\n' +
      'curl -s http://127.0.0.1:3000/admin/auth/login-options',
  ),
  note(
    'PENDING must be absent from login-options. It is refused at sign-in and excluded from the picker, so seeing it means the image is stale.',
  ),
  h3('7.3   Confirm nothing else can reach it'),
  code(
    '# From your own machine, not the instance. This must fail.\n' +
      'curl --max-time 5 http://<elastic-ip>:3000/admin/auth/login-options',
  ),
  p(
    'A connection refused or timeout is the correct answer. The port is bound to 127.0.0.1 in compose and is not open in the security group, so the API is reachable only through nginx.',
  ),
  PAGE_BREAK,
);

/* ----------------------------------------------------------- 8 nginx ----- */

add(
  band('8  \u00b7  NGINX AND TLS ON THE ORIGIN'),
  p(
    'CloudFront needs to reach the instance over HTTPS with a valid certificate. That means the origin gets its own name — origin.veltrixair.com — separate from the three admin subdomains. Users never type it.',
  ),
  h3('8.1   Point the origin name at the instance'),
  p(
    'In Hostinger DNS, add an A record now so certbot can validate. The rest of the DNS work is section 11.',
  ),
  table(
    ['Type', 'Name', 'Value'],
    [['A', 'origin', '<your Elastic IP>']],
    [900, 1800, 5300],
    { monoCols: [0, 1, 2] },
  ),
  h3('8.2   Install nginx and certbot'),
  code(
    'sudo apt install -y nginx certbot python3-certbot-nginx\n' +
      '\n' +
      'sudo cp /opt/veltrixair/app/deploy/nginx.conf \\\n' +
      '        /etc/nginx/sites-available/veltrixair\n' +
      'sudo ln -sf /etc/nginx/sites-available/veltrixair \\\n' +
      '            /etc/nginx/sites-enabled/veltrixair\n' +
      'sudo rm -f /etc/nginx/sites-enabled/default',
  ),
  h3('8.3   Issue the certificate'),
  code(
    'sudo certbot --nginx -d origin.veltrixair.com\n' +
      '\n' +
      'sudo nginx -t\n' +
      'sudo systemctl reload nginx\n' +
      '\n' +
      '# Renewal is installed as a systemd timer. Confirm it.\n' +
      'sudo systemctl status certbot.timer\n' +
      'sudo certbot renew --dry-run',
  ),
  h3('8.4   Verify the /api prefix is being stripped'),
  code(
    'curl -s https://origin.veltrixair.com/api/admin/auth/login-options\n' +
      '\n' +
      '# And confirm the header the trust-proxy setting depends on:\n' +
      'curl -s -I https://origin.veltrixair.com/api/admin/auth/login-options',
  ),
  p(
    'A 404 here means the trailing slash is missing from proxy_pass. Go back to 3.6 — it is always that.',
  ),
  PAGE_BREAK,
);

/* --------------------------------------------------------- 9 frontend ---- */

add(
  band('9  \u00b7  THE ADMIN PANEL ON S3', RUST),
  h3('9.1   Build it'),
  code(
    'cd C:\\Veltrixair_AdminPanel_FontendCode\n' +
      '\n' +
      'npm ci\n' +
      'npm run build          # tsc -b && vite build  ->  dist/\n' +
      '\n' +
      'dir dist',
  ),
  note(
    'The build type-checks first. A type error stops it, which is deliberate — it is the last gate before the bundle is public.',
  ),
  h3('9.2   Create the bucket'),
  code(
    'aws s3 mb s3://veltrixair-admin-panel --region me-central-1',
  ),
  p(
    'Leave Block Public Access fully on, and do not enable static website hosting. CloudFront will reach the bucket through an Origin Access Control instead, which keeps the bucket private and means the files can only be served through the distribution.',
  ),
  h3('9.3   Upload, with the right cache headers'),
  p(
    'This is two commands rather than one, and the reason matters. Vite fingerprints asset filenames, so those files can be cached forever. index.html cannot — it is the file that names the current fingerprints, and caching it is how people end up stuck on an old build after a deploy.',
  ),
  code(
    '# Fingerprinted assets: cache hard.\n' +
      'aws s3 sync dist/ s3://veltrixair-admin-panel \\\n' +
      '  --delete \\\n' +
      '  --exclude "index.html" \\\n' +
      '  --cache-control "public,max-age=31536000,immutable"\n' +
      '\n' +
      '# The entry point: never cache.\n' +
      'aws s3 cp dist/index.html s3://veltrixair-admin-panel/index.html \\\n' +
      '  --cache-control "no-cache,no-store,must-revalidate" \\\n' +
      '  --content-type "text/html"',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------------ 10 cloudfront ---- */

add(
  band('10  \u00b7  CLOUDFRONT', RUST),
  h3('10.1   Request the certificate — in us-east-1'),
  code(
    'aws acm request-certificate \\\n' +
      '  --domain-name "admin.veltrixair.com" \\\n' +
      '  --validation-method DNS \\\n' +
      '  --region us-east-1',
  ),
  p(
    'One hostname, so a single-name certificate rather than a wildcard — smaller blast radius if it is ever compromised, and one less thing to renew broadly. ACM returns a CNAME to add at Hostinger; the certificate stays Pending validation until it resolves, usually within minutes.',
  ),
  note(
    'This certificate is only for CloudFront. origin.veltrixair.com gets its own from Let’s Encrypt via certbot in section 8 — different issuer, different machine, different job.',
  ),
  h3('10.2   Create the distribution'),
  p('Two origins:'),
  table(
    ['Origin', 'Domain', 'Settings'],
    [
      [
        'S3',
        'veltrixair-admin-panel.s3...',
        'Origin access: OAC, create new. Let the console update the bucket policy.',
      ],
      [
        'EC2',
        'origin.veltrixair.com',
        'Custom origin. Protocol: HTTPS only.',
      ],
    ],
    [1000, 2600, 4400],
  ),
  h3('10.3   Two behaviours, and the order is not optional'),
  table(
    ['Precedence', 'Path', 'Origin', 'Policy'],
    [
      ['0', '/api/*', 'EC2', 'Cache: CachingDisabled. Origin request: AllViewer. Methods: all.'],
      ['1', 'Default (*)', 'S3', 'Cache: CachingOptimized. Methods: GET, HEAD.'],
    ],
    [1100, 1200, 900, 4800],
    { monoCols: [0, 1] },
  ),
  warn(
    'CachingDisabled on /api/* is not a performance preference.',
    'Caching API responses would serve one administrator\u2019s data to another. AllViewer is equally load-bearing: without it the Authorization header is dropped before it reaches the backend, and every authenticated request returns 401 while looking like a login bug.',
  ),
  h3('10.4   SPA fallback'),
  p(
    'React Router owns the URLs, so a refresh on /staff/123 asks S3 for a key that does not exist. Add two custom error responses:',
  ),
  table(
    ['HTTP error code', 'Response page path', 'HTTP response code'],
    [
      ['403', '/index.html', '200'],
      ['404', '/index.html', '200'],
    ],
    [2400, 2800, 2800],
    { monoCols: [0, 1, 2] },
  ),
  p(
    '403 is listed first for a reason: a private bucket behind OAC returns 403, not 404, for a missing key. Handling only 404 leaves every deep link broken.',
  ),
  h3('10.5   Alternate domain name'),
  code('admin.veltrixair.com'),
  p(
    'One entry. Attach the ACM certificate from 10.1, set Viewer protocol policy to Redirect HTTP to HTTPS, and create the distribution. Deployment takes roughly fifteen minutes.',
  ),
  PAGE_BREAK,
);

/* ----------------------------------------------------------- 11 DNS ------ */

add(
  band('11  \u00b7  DNS AT HOSTINGER'),
  p(
    'Hostinger stays the registrar and keeps serving DNS. You are only adding records — nothing about the existing public sites changes.',
  ),
  h3('11.1   The records'),
  table(
    ['Type', 'Name', 'Points to', 'Why'],
    [
      ['A', 'origin', '<Elastic IP>', 'The EC2 box (added in 8.1)'],
      ['CNAME', 'admin', 'dxxxx.cloudfront.net', 'The admin panel, all three units'],
      ['CNAME', '_xxxx', '(value from ACM)', 'Certificate validation'],
    ],
    [800, 1300, 2600, 3300],
    { monoCols: [0, 1, 2] },
  ),
  p(
    'Three records in total. Nothing about veltrixair.com, veltrixairindustries.com or dataprivacy.veltrixair.com changes — the public sites keep the records they already have.',
  ),
  note(
    'Hostinger appends the domain automatically — enter "admin", not "admin.veltrixair.com". Entering the full name produces admin.veltrixair.com.veltrixair.com, which is a genuinely confusing hour to debug.',
  ),
  h3('11.2   Wait, then check'),
  code(
    'nslookup admin.veltrixair.com\n' +
      'nslookup origin.veltrixair.com\n' +
      '\n' +
      'curl -sI https://admin.veltrixair.com | head -5',
  ),
  p(
    'Hostinger usually propagates within minutes, though the TTL can stretch it to an hour. Until it resolves everywhere, test through the CloudFront domain directly.',
  ),
  PAGE_BREAK,
);

/* --------------------------------------------------------- 12 backups ---- */

add(
  band('12  \u00b7  BACKUPS', GREEN),
  h2('What the volume does and does not protect you from'),
  p(
    'The bind mount means the database survives container rebuilds, image upgrades and redeploys. That is worth having, and it is not a backup.',
  ),
  table(
    ['Failure', 'Volume alone', 'Volume + dumps + off-box copy'],
    [
      ['Container rebuilt or upgraded', 'Safe', 'Safe'],
      ['Someone drops a table', 'Lost', 'Recovered from last night'],
      ['Disk corruption', 'Lost', 'Recovered'],
      ['Instance terminated', 'Lost', 'Recovered'],
      ['Region incident', 'Lost', 'Recovered if dumps are off-box'],
    ],
    [2700, 2200, 3100],
  ),
  p(
    'The rest of this section is what turns the first column into the second.',
  ),
  h3('12.1   The dump script'),
  code(
    'sudo tee /opt/veltrixair/backup.sh > /dev/null <<\'EOF\'\n' +
      '#!/usr/bin/env bash\n' +
      '# Nightly logical backup. Custom format so single tables can be restored\n' +
      '# without replaying the whole database.\n' +
      'set -euo pipefail\n' +
      '\n' +
      'STAMP=$(date +%Y%m%d-%H%M)\n' +
      'DIR=/opt/veltrixair/backups\n' +
      'KEEP_DAYS=14\n' +
      '\n' +
      'cd /opt/veltrixair/app\n' +
      '\n' +
      'docker compose exec -T postgres pg_dump \\\n' +
      '  --username=veltrixair --dbname=veltrixair \\\n' +
      '  --no-owner --no-privileges --format=custom \\\n' +
      '  > "$DIR/veltrixair-$STAMP.dump"\n' +
      '\n' +
      '# Uploaded documents are not in the database. Back them up too.\n' +
      'tar -czf "$DIR/storage-$STAMP.tar.gz" -C /opt/veltrixair/data storage\n' +
      '\n' +
      '# Off-box. A backup on the same disk as the database is not a backup.\n' +
      'aws s3 cp "$DIR/veltrixair-$STAMP.dump"   s3://veltrixair-backups/db/\n' +
      'aws s3 cp "$DIR/storage-$STAMP.tar.gz"    s3://veltrixair-backups/files/\n' +
      '\n' +
      'find "$DIR" -name "*.dump"    -mtime +$KEEP_DAYS -delete\n' +
      'find "$DIR" -name "*.tar.gz"  -mtime +$KEEP_DAYS -delete\n' +
      '\n' +
      'echo "$(date -Iseconds)  backup ok  $STAMP"\n' +
      'EOF\n' +
      '\n' +
      'sudo chmod +x /opt/veltrixair/backup.sh\n' +
      'sudo chown ubuntu:ubuntu /opt/veltrixair/backup.sh',
  ),
  note(
    'The -T flag on docker compose exec is required from cron: without a TTY attached the command fails, and it fails silently in the small hours.',
  ),
  h3('12.2   The backup bucket'),
  code(
    'aws s3 mb s3://veltrixair-backups --region me-central-1\n' +
      '\n' +
      '# Versioning, so a bad backup cannot overwrite a good one.\n' +
      'aws s3api put-bucket-versioning \\\n' +
      '  --bucket veltrixair-backups \\\n' +
      '  --versioning-configuration Status=Enabled',
  ),
  p(
    'Attach an IAM role to the instance granting s3:PutObject on this bucket only. Do not put access keys on the box.',
  ),
  h3('12.3   Schedule it'),
  code(
    'crontab -e\n' +
      '\n' +
      '# 02:30 Riyadh time, every night.\n' +
      '30 2 * * *  /opt/veltrixair/backup.sh >> /var/log/veltrixair-backup.log 2>&1',
  ),
  code(
    '# Run it once by hand first, and read the output.\n' +
      '/opt/veltrixair/backup.sh\n' +
      'ls -lh /opt/veltrixair/backups/\n' +
      'aws s3 ls s3://veltrixair-backups/db/',
  ),
  h3('12.4   The restore drill'),
  p(
    'A backup nobody has restored is a hypothesis. Do this once now, and once a quarter afterwards.',
  ),
  code(
    '# Restore last night into a scratch database on the same server.\n' +
      'docker compose exec postgres createdb -U veltrixair restore_test\n' +
      '\n' +
      'docker compose exec -T postgres pg_restore \\\n' +
      '  --username=veltrixair --dbname=restore_test \\\n' +
      '  --no-owner --no-privileges \\\n' +
      '  < /opt/veltrixair/backups/veltrixair-<stamp>.dump\n' +
      '\n' +
      '# Compare against production.\n' +
      'docker compose exec postgres psql -U veltrixair -d restore_test \\\n' +
      '  -c "SELECT count(*) FROM admins;"\n' +
      '\n' +
      'docker compose exec postgres dropdb -U veltrixair restore_test',
  ),
  warn(
    'Restore into a scratch database, never over the live one.',
    'pg_restore into the production database while the API is connected produces a half-restored schema and a very bad afternoon. Create restore_test, verify there, then decide.',
  ),
  h3('12.5   Also snapshot the volume'),
  p(
    'Dumps protect the data; an EBS snapshot protects the whole machine. Enable Data Lifecycle Manager on the instance with a daily snapshot and seven-day retention. Recovering from a snapshot is a new instance in minutes rather than a rebuild from these instructions.',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------------ 13 go-live ------- */

add(
  band('13  \u00b7  GO-LIVE CHECKLIST'),
  p('Work down it. Every line is something that has gone wrong for somebody.'),
  h3('Backend'),
  bullet('trust proxy is set in main.ts and the image was rebuilt after that change'),
  bullet('config/prod.env is chmod 600 and is not in git'),
  bullet('ADMIN_JWT_SECRET and IP_PEPPER are new values, not the development ones'),
  bullet('migration:show reports nothing pending'),
  bullet('Port 3000 is not reachable from outside the instance'),
  bullet('Port 5432 is not reachable from outside the instance'),
  h3('Frontend'),
  bullet('VITE_USE_MOCK_AUTH=0 in the production build'),
  bullet('VITE_DEV_SITE_CODE is not set'),
  bullet('index.html uploaded with no-cache; hashed assets with immutable'),
  bullet('The bucket is private — Block Public Access on, reached only through OAC'),
  h3('CloudFront'),
  bullet('/api/* behaviour has precedence 0, CachingDisabled and AllViewer'),
  bullet('403 and 404 both map to /index.html with status 200'),
  bullet('admin.veltrixair.com is listed as the alternate domain name'),
  bullet('The certificate is the us-east-1 one'),
  h3('End to end'),
  bullet('admin.veltrixair.com loads the login screen with all three dashboard cards'),
  bullet('Pick IT, sign in with an IT badge, land on the IT dashboard'),
  bullet('Sign out, pick Crane, sign in with a crane badge, get the crane dashboard'),
  bullet('Pick a unit you hold no badge on and get a refusal naming what you do hold'),
  bullet('Refresh on a deep link and get the page, not a 404'),
  bullet('The profile screen shows admin.veltrixair.com, not an old subdomain'),
  bullet('Upload a document, then confirm the file exists under /opt/veltrixair/data/storage'),
  bullet('Six people sign in within a minute and nobody sees a 429'),
  bullet('backup.sh has run once and the dump is visible in S3'),
  bullet('A restore into restore_test has been done and the counts matched'),
  PAGE_BREAK,
);

/* -------------------------------------------------------- 14 runbook ----- */

add(
  band('14  \u00b7  DAY-TO-DAY RUNBOOK'),
  h3('Deploy a backend change'),
  code(
    'ssh -i veltrixair-prod.pem ubuntu@<elastic-ip>\n' +
      'cd /opt/veltrixair/app\n' +
      '\n' +
      'git pull\n' +
      'docker compose build api\n' +
      '\n' +
      '# Migrations first, while the old container is still serving.\n' +
      'docker compose run --rm api npm run migration:run\n' +
      '\n' +
      'docker compose up -d api\n' +
      'docker compose logs -f api',
  ),
  h3('Deploy a frontend change'),
  code(
    'cd C:\\Veltrixair_AdminPanel_FontendCode\n' +
      'npm run build\n' +
      '\n' +
      'aws s3 sync dist/ s3://veltrixair-admin-panel --delete \\\n' +
      '  --exclude "index.html" \\\n' +
      '  --cache-control "public,max-age=31536000,immutable"\n' +
      '\n' +
      'aws s3 cp dist/index.html s3://veltrixair-admin-panel/index.html \\\n' +
      '  --cache-control "no-cache,no-store,must-revalidate" \\\n' +
      '  --content-type "text/html"\n' +
      '\n' +
      '# Only index.html needs flushing — the rest is fingerprinted.\n' +
      'aws cloudfront create-invalidation \\\n' +
      '  --distribution-id <ID> --paths "/index.html"',
  ),
  h3('Logs'),
  code(
    'docker compose logs -f api\n' +
      'docker compose logs --tail 200 postgres\n' +
      'sudo tail -f /var/log/nginx/error.log\n' +
      'tail -f /var/log/veltrixair-backup.log',
  ),
  h3('Restart'),
  code(
    'docker compose restart api          # API only\n' +
      'docker compose restart             # both\n' +
      'sudo systemctl reload nginx        # after an nginx config change',
  ),
  h3('Roll a backend release back'),
  code(
    'cd /opt/veltrixair/app\n' +
      'git log --oneline -5\n' +
      'git checkout <previous-commit>\n' +
      'docker compose build api && docker compose up -d api',
  ),
  warn(
    'A rollback does not undo a migration.',
    'If the release you are reversing added a migration, revert it deliberately with docker compose run --rm api npm run migration:revert — and read what it drops before you run it.',
  ),
  h3('Restore the database'),
  code(
    'cd /opt/veltrixair/app\n' +
      '\n' +
      '# Stop the API so nothing writes mid-restore. Leave postgres running.\n' +
      'docker compose stop api\n' +
      '\n' +
      'docker compose exec -T postgres pg_restore \\\n' +
      '  --username=veltrixair --dbname=veltrixair \\\n' +
      '  --clean --if-exists --no-owner --no-privileges \\\n' +
      '  < /opt/veltrixair/backups/veltrixair-<stamp>.dump\n' +
      '\n' +
      'docker compose start api',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------------- appendices ------ */

add(
  band('APPENDIX A  \u00b7  FILES CREATED OR CHANGED'),
  table(
    ['File', 'Repository', 'Change'],
    [
      ['src/main.ts', 'backend', 'Add trust proxy'],
      ['Dockerfile', 'backend', 'New'],
      ['.dockerignore', 'backend', 'New'],
      ['docker-compose.yml', 'backend', 'New'],
      ['deploy/nginx.conf', 'backend', 'New'],
      ['config/prod.env', 'backend', 'New \u2014 on the server only, never committed'],
      ['.env', 'backend', 'New \u2014 on the server only, POSTGRES_PASSWORD'],
      ['.env.production', 'frontend', 'New \u2014 VITE_USE_MOCK_AUTH=0'],
      ['src/lib/site.ts', 'frontend', 'Picker subtitles \u2014 drop the old subdomains'],
      ['site_masters', 'database', 'All three admin_domain rows \u2192 admin.veltrixair.com'],
    ],
    [2200, 1300, 4500],
    { monoCols: [0] },
  ),
  note(
    'The site_masters update is a one-line UPDATE, not a migration \u2014 it is configuration for this deployment rather than a schema change, and a different environment may legitimately hold a different hostname.',
  ),

  band('APPENDIX B  \u00b7  ENVIRONMENT VARIABLES'),
  table(
    ['Variable', 'Production value', 'Notes'],
    [
      ['NODE_ENV', 'production', 'Selects config/prod.env in data-source.ts'],
      ['DB_HOST', 'postgres', 'The compose service name'],
      ['DB_SSL', 'false', 'The hop stays inside the Docker network'],
      ['CORS_ORIGINS', '(empty)', 'Single origin \u2014 no cross-origin request exists'],
      ['ADMIN_JWT_SECRET', '(generated)', 'Rotating it signs everyone out'],
      ['ADMIN_ACCESS_TOKEN_TTL', '15m', 'Refresh token keeps the session for 7 days'],
      ['IP_PEPPER', '(generated)', 'Cannot be rotated \u2014 old hashes stop matching'],
      ['LOCAL_STORAGE_DIR', '/app/storage', 'Must be the mounted volume'],
      ['THROTTLE_LIMIT', '100', 'Global. Login has its own 5/min limit in code'],
      ['SUPABASE_URL', '(unset)', 'Its absence selects the local storage driver'],
    ],
    [2300, 1900, 3800],
    { monoCols: [0, 1] },
  ),

  PAGE_BREAK,
  band('APPENDIX C  \u00b7  WHAT THIS SETUP DOES NOT GIVE YOU', RUST),
  p(
    'This is a sound single-server deployment and it will serve three admin panels comfortably. It is worth being clear about its limits before rather than during an incident.',
  ),
  h3('One instance is one point of failure'),
  p(
    'The API and the database share a machine. If it fails, both are down until a new one is built. Recovery is the EBS snapshot plus this document, realistically under an hour, but it is not automatic and it is not instant.',
  ),
  h3('Your backups are the entire safety net'),
  p(
    'A managed database would give you point-in-time recovery. Here the worst case is losing everything since 02:30. If that becomes unacceptable, that is the moment to move Postgres to RDS — the application needs no change beyond DB_HOST and DB_SSL, because database.config.ts already switches SSL on automatically for an rds.amazonaws.com host.',
  ),
  h3('The database competes with the API for memory'),
  p(
    'On a t3.small they share 2 GB. Fine at current volumes; watch it as the tables grow, and treat sustained swapping as the signal to separate them.',
  ),
  h3('Mail still does not send'),
  p(
    'The mail dispatcher logs rather than delivers. Staff invitations, P1 alerts and password resets will all appear to succeed and never arrive. This is not a deployment problem and this document does not fix it — but it will be the first thing reported after go-live, so it is worth knowing now.',
  ),
  note(
    'Generated from the codebases at C:\\VELTRIXAIR.COM-Backend and C:\\Veltrixair_AdminPanel_FontendCode. Re-run scripts/build-deployment-docx.js after any change to the deployment shape.',
  ),
);

/* ------------------------------------------------------------- package --- */

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:body>${parts.join('')}` +
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="1100" w:right="1100" w:bottom="1100" w:left="1100" ` +
  `w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>` +
  `</w:body></w:document>`;

const stylesXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:docDefaults><w:rPrDefault><w:rPr>` +
  `<w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Segoe UI" w:cs="Segoe UI"/>` +
  `<w:sz w:val="17"/><w:szCs w:val="17"/><w:color w:val="${INK}"/>` +
  `</w:rPr></w:rPrDefault></w:docDefaults>` +
  `</w:styles>`;

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
  `<cp:coreProperties ` +
  `xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
  `xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
  `xmlns:dcterms="http://purl.org/dc/terms/" ` +
  `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
  `<dc:title>Veltrixair \u2014 Production Deployment Runbook</dc:title>` +
  `<dc:creator>Veltrixair Engineering</dc:creator>` +
  `<cp:lastModifiedBy>Veltrixair Engineering</cp:lastModifiedBy>` +
  `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>` +
  `<dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>` +
  `</cp:coreProperties>`;

const buffer = zip([
  { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
  { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
  { name: 'docProps/core.xml', data: Buffer.from(coreXml, 'utf8') },
  { name: 'word/_rels/document.xml.rels', data: Buffer.from(documentRels, 'utf8') },
  { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') },
  { name: 'word/styles.xml', data: Buffer.from(stylesXml, 'utf8') },
]);

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, buffer);

console.log(
  `wrote: ${path.relative(path.join(__dirname, '..'), OUTPUT)}  (${(buffer.length / 1024).toFixed(0)} KB)`,
);
