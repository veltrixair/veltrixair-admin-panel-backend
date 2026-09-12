/**
 * Builds docs/VeltrixAir-AWS-Migration-Guide.docx — moving the whole project
 * off Supabase and onto one EC2 server.
 *
 *   node scripts/build-aws-migration-docx.js
 *
 * Target shape, which differs from the earlier CloudFront runbook:
 *
 *   - ONE EC2 instance running THREE containers: web (nginx + the built SPA),
 *     api (this backend), postgres (the database)
 *   - ONE private S3 bucket for uploaded files, replacing Supabase Storage
 *   - no CloudFront, no S3 website hosting — nginx serves the panel and
 *     proxies /api to the backend over the internal Docker network
 *
 * Written for somebody who has not deployed with Docker before, so it explains
 * the ideas as well as the commands.
 *
 * The facts here were read out of the codebase rather than assumed. The one
 * that shapes the whole document: there is NO S3 storage driver. src/files/
 * storage/ holds local and supabase only, and package.json has no AWS SDK, so
 * this migration needs real code and not just configuration. The interface is
 * three methods and files.module.ts already switches on STORAGE_DRIVER, so it
 * is a small piece of work — but it is work, and a guide that omitted it would
 * strand the reader at the point of no return.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUTPUT = path.join(
  __dirname,
  '..',
  'docs',
  'VeltrixAir-AWS-Migration-Guide.docx',
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

const run = (text, { bold, italic, color, size = 8.5, mono } = {}) =>
  `<w:r><w:rPr>` +
  (mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : '') +
  (bold ? '<w:b/>' : '') +
  (italic ? '<w:i/>' : '') +
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
const IDEA_BG = 'E9F1EE';

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

const step = (n, text) =>
  para(
    run(`${n}. `, { size: 8.5, bold: true, color: NAVY }) + run(text, { size: 8.5 }),
    { indent: 220, after: 50 },
  );

const code = (text) => {
  const lines = String(text).replace(/\t/g, '  ').split('\n');
  return lines
    .map((l, i) =>
      para(run(l === '' ? ' ' : l, { mono: true, size: 7.5 }), {
        before: i === 0 ? 40 : 0,
        after: i === lines.length - 1 ? 100 : 0,
        line: 200,
        indent: 160,
        shd: CODE_BG,
      }),
    )
    .join('');
};

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

/** Beginner explainer. Visually distinct from a warning on purpose. */
const idea = (title, text) =>
  para(run(`  ${title}`, { bold: true, size: 8.4, color: GREEN }), {
    before: 110,
    after: 0,
    shd: IDEA_BG,
  }) +
  para(run(`  ${text}`, { size: 8.3, color: INK }), {
    before: 0,
    after: 110,
    shd: IDEA_BG,
  });

/** "Run this, and you should see that." Keeps the reader oriented. */
const expect = (text) =>
  para(
    run('You should see:  ', { size: 8.2, bold: true, color: GREEN }) +
      run(text, { size: 8.2, color: INK }),
    { indent: 160, before: 0, after: 110 },
  );

/* --------------------------------------------------------------- table --- */

const cell = (text, { bold, width, fill, align = 'left', color = INK, mono } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
  (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '') +
  `<w:vAlign w:val="center"/></w:tcPr>` +
  `<w:p><w:pPr><w:spacing w:before="24" w:after="24" w:line="200" w:lineRule="auto"/>` +
  `<w:jc w:val="${align}"/></w:pPr>` +
  run(text, { bold, size: 7.6, color, mono }) +
  `</w:p></w:tc>`;

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
  para(run('Moving to AWS \u2014 a step-by-step guide', { size: 15, color: INK }), {
    after: 60,
  }),
  para(
    run(
      'One EC2 server \u00b7 three Docker containers \u00b7 one S3 bucket \u00b7 leaving Supabase behind',
      { size: 9, color: MUTED },
    ),
    { after: 240, border: RULE },
  ),
  p(
    'This guide assumes you have not deployed with Docker before. It explains what each piece is and why it is there, not just which commands to type, and every command says what you should see when it works.',
  ),
  p(
    'Read it once end to end before starting anything. There is one step in the middle \u2014 moving the files \u2014 that is much easier to do before you switch over than after.',
  ),
  h2('Where you are now'),
  table(
    ['Piece', 'Today', 'After this guide'],
    [
      ['Database', 'Supabase (hosted PostgreSQL)', 'PostgreSQL container on your EC2'],
      ['Uploaded files', 'Supabase Storage bucket', 'Private S3 bucket'],
      ['Backend', 'Your laptop', 'Container on your EC2'],
      ['Admin panel', 'Your laptop', 'Container on your EC2'],
      ['Domain', 'Hostinger', 'Hostinger (unchanged)'],
    ],
    [1700, 3000, 3300],
  ),
  note(
    'Generated by scripts/build-aws-migration-docx.js from the code at C:\\VELTRIXAIR.COM-Backend and C:\\Veltrixair_AdminPanel_FontendCode.',
  ),
  PAGE_BREAK,
);

/* --------------------------------------------------- 0 the plan ---------- */

add(
  band('0  \u00b7  THE PLAN, IN PLAIN ENGLISH'),
  p(
    'You will end up with one computer in Amazon\u2019s data centre running three programs, plus one storage bucket for files.',
  ),
  code(
    '                    admin.veltrixair.com                              \n' +
      '                            |                                        \n' +
      '                            |  HTTPS                                 \n' +
      '   +========================|====================================+   \n' +
      '   |  ONE EC2 SERVER        v                                    |   \n' +
      '   |                  +-----------+                              |   \n' +
      '   |                  |   web     |  nginx. Serves the admin     |   \n' +
      '   |                  | container |  panel, and forwards /api    |   \n' +
      '   |                  +-----+-----+  to the backend.             |   \n' +
      '   |                        |                                    |   \n' +
      '   |                        v  (private Docker network)          |   \n' +
      '   |                  +-----------+                              |   \n' +
      '   |                  |    api    |  the NestJS backend          |   \n' +
      '   |                  | container |                              |   \n' +
      '   |                  +-----+-----+                              |   \n' +
      '   |                        |                                    |   \n' +
      '   |                        v                                    |   \n' +
      '   |                  +-----------+                              |   \n' +
      '   |                  | postgres  |  the database                |   \n' +
      '   |                  | container |                              |   \n' +
      '   |                  +-----+-----+                              |   \n' +
      '   |                        |                                    |   \n' +
      '   |            /opt/veltrixair/data/postgres                    |   \n' +
      '   |            (a folder on the server\u2019s disk)                  |   \n' +
      '   +=============================|===============================+   \n' +
      '                                 |                                   \n' +
      '                                 v                                   \n' +
      '                        +-----------------+                          \n' +
      '                        |   S3 bucket     |  CVs, documents, PDFs    \n' +
      '                        |    (private)    |                          \n' +
      '                        +-----------------+                          ',
  ),
  h2('Why three containers rather than one'),
  p(
    'You could put everything in one container. You should not, for three reasons that will each save you an evening at some point.',
  ),
  bullet(
    'They fail separately. If the backend crashes, the database keeps running and your data is untouched.',
  ),
  bullet(
    'They update separately. Deploying a backend change rebuilds one container. The database is not restarted and nobody notices.',
  ),
  bullet(
    'They are isolated. Only the web container is reachable from the internet. The backend and database have no open ports at all \u2014 the only way to reach them is from inside the server.',
  ),
  h2('How a request actually travels'),
  table(
    ['Step', 'What happens'],
    [
      ['1', 'Someone opens admin.veltrixair.com in a browser'],
      ['2', 'Hostinger DNS points that name at your server\u2019s IP address'],
      ['3', 'The web container answers, and sends back the admin panel'],
      ['4', 'The panel asks for data at /api/admin/auth/login'],
      ['5', 'nginx sees /api, strips it, forwards to the api container'],
      ['6', 'The backend asks the postgres container for the data'],
      ['7', 'If a file is involved, the backend asks S3 for a temporary link'],
    ],
    [800, 7200],
  ),
  idea(
    'Why there is no CORS to configure here',
    'The browser only ever talks to one address: admin.veltrixair.com. The panel and the API look like the same website to it, even though nginx is quietly sending some requests to a different container. Browsers only enforce CORS when a page talks to a different address than it was loaded from \u2014 so this design removes the whole category of problem. Your frontend was already written this way: its .env.example says "Production serves both from one origin."',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------- 1 ideas --------------- */

add(
  band('1  \u00b7  FIVE IDEAS YOU NEED FIRST', GREEN),
  p(
    'Skip this part if Docker is already familiar. If it is not, these five ideas are the ones that make the rest of the guide make sense.',
  ),
  h3('1.  An image is a recipe. A container is the meal.'),
  p(
    'An image is a frozen, read-only snapshot: your code plus the exact version of Node it needs plus its dependencies. A container is one running copy of that image. You build an image once and can run it anywhere, and it behaves identically \u2014 that is the whole point.',
  ),
  h3('2.  A container forgets everything when it stops.'),
  p(
    'This surprises everyone once. Anything written inside a running container disappears the moment the container is replaced. Since you replace containers every time you deploy, that would destroy your database on the first update.',
  ),
  h3('3.  A volume is the fix.'),
  p(
    'A volume connects a folder inside the container to a real folder on the server\u2019s disk. The database writes to /var/lib/postgresql/data inside the container, and that is really /opt/veltrixair/data/postgres on the server. Delete the container, build a new one, attach the same folder \u2014 all the data is still there.',
  ),
  idea(
    'The rule to remember',
    'The database runs in a container. The database\u2019s data does not. Containers are disposable; the folder they write to is not. Everything about backups follows from this.',
  ),
  h3('4.  Containers talk to each other by name.'),
  p(
    'Docker gives the three containers a private network. Inside it, the backend reaches the database at the address postgres \u2014 literally that word, which is why config/prod.env says DB_HOST=postgres. This network is not reachable from the internet, which is why the database needs no password protection at the firewall level. It has no door to the outside at all.',
  ),
  h3('5.  Only one container has open ports.'),
  p(
    'The web container publishes ports 80 and 443. The api and postgres containers publish nothing. If someone finds your server\u2019s IP address and tries to connect to the database directly, there is nothing listening. That is not a setting you switch on later \u2014 it is the default, as long as you do not add a ports line to those two services.',
  ),
  PAGE_BREAK,
);

/* --------------------------------------------------- 2 before ------------ */

add(
  band('2  \u00b7  BEFORE YOU BEGIN'),
  h2('Accounts'),
  bullet('An AWS account with a payment method'),
  bullet('Your Hostinger login, for the DNS settings on veltrixair.com'),
  bullet('Your Supabase project, still working \u2014 you will copy from it'),
  h2('On your computer'),
  code(
    'node --version      # 20 or newer\n' +
      'aws --version       # AWS CLI v2\n' +
      'psql --version      # comes with PostgreSQL client tools\n' +
      'ssh -V',
  ),
  p(
    'On Windows the PostgreSQL client tools are the piece people are usually missing. Install "PostgreSQL" from postgresql.org and pick only Command Line Tools during setup \u2014 you do not need a local database server.',
  ),
  h2('Decisions'),
  table(
    ['Decision', 'Suggested', 'Why'],
    [
      ['AWS region', 'me-central-1 (UAE)', 'Nearest to Riyadh and Dubai'],
      ['Server size', 't3.small (2 vCPU, 2 GB)', 'Three containers need room; micro is too small'],
      ['Disk', '30 GB gp3', 'Database plus backups plus images'],
      ['Bucket name', 'veltrixair-files', 'Must be globally unique across all of AWS'],
      ['Admin address', 'admin.veltrixair.com', 'One address, all three units'],
    ],
    [1700, 2400, 3900],
  ),
  h2('Secrets \u2014 generate these now, keep them somewhere safe'),
  code(
    'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"   # ADMIN_JWT_SECRET\n' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"        # IP_PEPPER\n' +
      'node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'base64url\'))"   # POSTGRES_PASSWORD',
  ),
  warn(
    'Do not reuse the values in config/dev.env.',
    'That file has been on your laptop and in your shell history. Production gets fresh values. And note IP_PEPPER can never be changed later without making every stored ip_hash meaningless \u2014 pick it once.',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------- 3 the S3 driver ------------- */

add(
  band('3  \u00b7  THE ONE PIECE OF CODE THAT DOES NOT EXIST YET', RUST),
  p(
    'Everything else in this guide is configuration. This part is real code, and it has to be written before the migration can finish, so it comes first.',
  ),
  h2('What is missing'),
  p(
    'The backend talks to file storage through a small interface with three methods. Two implementations exist:',
  ),
  code(
    'src/files/storage/\n' +
      '  storage.provider.ts          the interface: put, signedUrl, remove\n' +
      '  local-storage.service.ts     writes to a folder \u2014 development\n' +
      '  supabase-storage.service.ts  Supabase Storage \u2014 what you use today\n' +
      '\n' +
      '  s3-storage.service.ts        <-- does not exist. You are adding it.',
  ),
  p(
    'There is also no AWS SDK in package.json. So S3 is not a setting you turn on \u2014 it is a driver you add. The good news is that the seam was designed for exactly this, and files.module.ts already reads a STORAGE_DRIVER variable, so nothing else has to change.',
  ),
  idea(
    'Why the bucket must be private',
    'The interface has a signedUrl method rather than a getUrl method, and that is deliberate. Files are never publicly readable. When somebody downloads a CV, the backend generates a link that works for five minutes and then stops working. A public bucket would quietly defeat that \u2014 anyone who ever saw a link could share it forever.',
  ),
  h3('3.1   Add the dependency'),
  code(
    'cd C:\\VELTRIXAIR.COM-Backend\n' +
      'npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner',
  ),
  h3('3.2   Create src/files/storage/s3-storage.service.ts'),
  code(
    "import {\n" +
      '  Injectable,\n' +
      '  InternalServerErrorException,\n' +
      '  Logger,\n' +
      "} from '@nestjs/common';\n" +
      "import { ConfigService } from '@nestjs/config';\n" +
      'import {\n' +
      '  DeleteObjectCommand,\n' +
      '  GetObjectCommand,\n' +
      '  PutObjectCommand,\n' +
      '  S3Client,\n' +
      "} from '@aws-sdk/client-s3';\n" +
      "import { getSignedUrl } from '@aws-sdk/s3-request-presigner';\n" +
      "import { StorageProvider } from './storage.provider';\n" +
      '\n' +
      '/**\n' +
      ' * Amazon S3.\n' +
      ' *\n' +
      ' * The bucket must be PRIVATE, for the same reason the Supabase one is:\n' +
      ' * every read goes through a time-limited signed URL, and a public bucket\n' +
      ' * would defeat the gating on whitepapers and expose CVs stored beside them.\n' +
      ' */\n' +
      '@Injectable()\n' +
      'export class S3StorageService implements StorageProvider {\n' +
      "  readonly name = 's3';\n" +
      '\n' +
      '  private readonly logger = new Logger(S3StorageService.name);\n' +
      '  private readonly client: S3Client;\n' +
      '  private readonly bucket: string;\n' +
      '\n' +
      '  constructor(config: ConfigService) {\n' +
      "    this.bucket = config.getOrThrow<string>('S3_BUCKET');\n" +
      '    this.client = new S3Client({\n' +
      "      region: config.getOrThrow<string>('AWS_REGION'),\n" +
      '      // No credentials passed on purpose. On EC2 the SDK finds the\n' +
      '      // instance role by itself, so no access keys ever sit on the box.\n' +
      '    });\n' +
      '  }\n' +
      '\n' +
      '  async put(key: string, body: Buffer, contentType: string): Promise<void> {\n' +
      '    try {\n' +
      '      await this.client.send(\n' +
      '        new PutObjectCommand({\n' +
      '          Bucket: this.bucket,\n' +
      '          Key: key,\n' +
      '          Body: body,\n' +
      '          ContentType: contentType,\n' +
      '        }),\n' +
      '      );\n' +
      '    } catch (error) {\n' +
      '      this.logger.error(\n' +
      '        `Upload failed for ${key}: ${(error as Error).message}`,\n' +
      '      );\n' +
      "      throw new InternalServerErrorException('Could not store the file');\n" +
      '    }\n' +
      '  }\n' +
      '\n' +
      '  async signedUrl(key: string, ttlSeconds: number): Promise<string> {\n' +
      '    try {\n' +
      '      return await getSignedUrl(\n' +
      '        this.client,\n' +
      '        new GetObjectCommand({ Bucket: this.bucket, Key: key }),\n' +
      '        { expiresIn: ttlSeconds },\n' +
      '      );\n' +
      '    } catch (error) {\n' +
      '      this.logger.error(\n' +
      '        `Signing failed for ${key}: ${(error as Error).message}`,\n' +
      '      );\n' +
      '      throw new InternalServerErrorException(\n' +
      "        'Could not produce a download link',\n" +
      '      );\n' +
      '    }\n' +
      '  }\n' +
      '\n' +
      '  async remove(key: string): Promise<void> {\n' +
      '    try {\n' +
      '      // S3 delete is already idempotent: removing a key that is not\n' +
      '      // there succeeds, which is what retention purges and erasure\n' +
      '      // requests both want.\n' +
      '      await this.client.send(\n' +
      '        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),\n' +
      '      );\n' +
      '    } catch (error) {\n' +
      '      this.logger.error(\n' +
      '        `Delete failed for ${key}: ${(error as Error).message}`,\n' +
      '      );\n' +
      "      throw new InternalServerErrorException('Could not delete the file');\n" +
      '    }\n' +
      '  }\n' +
      '}',
  ),
  h3('3.3   Register it in src/files/files.module.ts'),
  p('Add the import, then one branch to the factory that is already there:'),
  code(
    "import { S3StorageService } from './storage/s3-storage.service';\n" +
      '\n' +
      '// ...inside the STORAGE_PROVIDER useFactory, before the supabase branch:\n' +
      '\n' +
      "if (driver === 's3') {\n" +
      '  logger.log(\n' +
      "    `Using S3 \u2014 bucket \"${config.getOrThrow<string>('S3_BUCKET')}\"`,\n" +
      '  );\n' +
      '  return new S3StorageService(config);\n' +
      '}',
  ),
  note(
    'The factory already reads STORAGE_DRIVER and falls back to supabase or local. Setting STORAGE_DRIVER=s3 in config/prod.env is all it takes once this branch exists.',
  ),
  h3('3.4   Check it compiles'),
  code('npm run build'),
  expect('no errors, and a dist/ folder.'),
  PAGE_BREAK,
);

/* ------------------------------------------- 4 the other files ----------- */

add(
  band('4  \u00b7  FILES TO CREATE', RUST),
  p('Six files. None of them exist yet. Create them locally and commit them.'),

  h2('4.1   Dockerfile   (backend, at the project root)'),
  code(
    '# ---- stage 1: build ---------------------------------------------------\n' +
      'FROM node:20-alpine AS build\n' +
      'WORKDIR /app\n' +
      '\n' +
      '# Copy the dependency list first. Docker caches this layer, so changing\n' +
      '# your own code does not reinstall every package.\n' +
      'COPY package*.json ./\n' +
      'RUN npm ci\n' +
      '\n' +
      'COPY . .\n' +
      'RUN npm run build\n' +
      '\n' +
      '# ---- stage 2: run -----------------------------------------------------\n' +
      '# A second, clean image. The build tools stay behind in stage 1, so the\n' +
      '# image you actually ship is much smaller.\n' +
      'FROM node:20-alpine AS run\n' +
      'WORKDIR /app\n' +
      'ENV NODE_ENV=production\n' +
      '\n' +
      'COPY package*.json ./\n' +
      'RUN npm ci --omit=dev\n' +
      '\n' +
      'COPY --from=build /app/dist ./dist\n' +
      '\n' +
      '# Migrations run through ts-node against src/data-source.ts, so the\n' +
      '# source has to come along too. A dist-only image cannot migrate itself.\n' +
      'COPY --from=build /app/src ./src\n' +
      'COPY tsconfig*.json ./\n' +
      '\n' +
      'USER node\n' +
      'EXPOSE 3000\n' +
      'CMD ["node", "dist/main"]',
  ),

  h2('4.2   .dockerignore   (backend)'),
  code(
    'node_modules\n' +
      'dist\n' +
      '.git\n' +
      'docs\n' +
      'storage\n' +
      'config/*.env\n' +
      '*.log',
  ),
  warn(
    'The config/*.env line is not optional.',
    'Without it your development database password and JWT secret are baked into the image, readable by anyone who can pull it.',
  ),

  h2('4.3   Dockerfile   (frontend, in C:\\Veltrixair_AdminPanel_FontendCode)'),
  p(
    'This one builds the panel into plain HTML, CSS and JavaScript, then throws Node away entirely and serves the result with nginx. The final image contains no JavaScript runtime at all \u2014 it is a web server and a folder of files.',
  ),
  code(
    '# ---- stage 1: build the panel ----------------------------------------\n' +
      'FROM node:20-alpine AS build\n' +
      'WORKDIR /app\n' +
      '\n' +
      'COPY package*.json ./\n' +
      'RUN npm ci\n' +
      '\n' +
      'COPY . .\n' +
      '\n' +
      '# Use the real API rather than the fixtures.\n' +
      'ENV VITE_USE_MOCK_AUTH=0\n' +
      'RUN npm run build          # tsc -b && vite build  ->  /app/dist\n' +
      '\n' +
      '# ---- stage 2: serve it ------------------------------------------------\n' +
      'FROM nginx:1.27-alpine AS run\n' +
      '\n' +
      'COPY --from=build /app/dist /usr/share/nginx/html\n' +
      'COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf\n' +
      '\n' +
      'EXPOSE 80 443',
  ),

  h2('4.4   deploy/nginx.conf   (frontend repository)'),
  p(
    'This file does three jobs: serves the panel, forwards API calls to the backend, and lets the certificate tool prove you own the domain.',
  ),
  code(
    'server {\n' +
      '    listen 80;\n' +
      '    server_name admin.veltrixair.com;\n' +
      '\n' +
      "    # Let's Encrypt writes a proof file here to check you own the domain.\n" +
      '    location /.well-known/acme-challenge/ {\n' +
      '        root /var/www/certbot;\n' +
      '    }\n' +
      '\n' +
      '    location / { return 301 https://$host$request_uri; }\n' +
      '}\n' +
      '\n' +
      'server {\n' +
      '    listen 443 ssl;\n' +
      '    http2 on;\n' +
      '    server_name admin.veltrixair.com;\n' +
      '\n' +
      '    ssl_certificate     /etc/letsencrypt/live/admin.veltrixair.com/fullchain.pem;\n' +
      '    ssl_certificate_key /etc/letsencrypt/live/admin.veltrixair.com/privkey.pem;\n' +
      '\n' +
      '    # CV uploads are capped at 5 MB; this leaves room for the envelope.\n' +
      '    client_max_body_size 20m;\n' +
      '\n' +
      '    # --- the API -------------------------------------------------------\n' +
      '    # "api" is the container name on the private Docker network.\n' +
      '    location /api/ {\n' +
      '        # The trailing slash below is what removes /api from the path.\n' +
      '        proxy_pass http://api:3000/;\n' +
      '\n' +
      '        proxy_set_header Host              $host;\n' +
      '        proxy_set_header X-Real-IP         $remote_addr;\n' +
      '        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;\n' +
      '        proxy_set_header X-Forwarded-Proto $scheme;\n' +
      '    }\n' +
      '\n' +
      '    # --- the admin panel -----------------------------------------------\n' +
      '    root /usr/share/nginx/html;\n' +
      '    index index.html;\n' +
      '\n' +
      '    # Fingerprinted files never change, so cache them for a year.\n' +
      '    location /assets/ {\n' +
      '        expires 1y;\n' +
      '        add_header Cache-Control "public, immutable";\n' +
      '    }\n' +
      '\n' +
      '    location / {\n' +
      '        # The panel owns its own URLs. If the file is not on disk, hand\n' +
      '        # back index.html and let the app route it. Without this line,\n' +
      '        # refreshing on /staff/123 gives a 404.\n' +
      '        try_files $uri $uri/ /index.html;\n' +
      '    }\n' +
      '}',
  ),
  warn(
    'Two lines here break everything if you get them wrong.',
    'proxy_pass http://api:3000/ needs the trailing slash \u2014 without it, /api stays on the path and every backend route returns 404. And try_files without /index.html at the end means every page refresh 404s. These are the two most common mistakes in this whole guide.',
  ),

  h2('4.5   docker-compose.yml   (backend repository)'),
  p(
    'This is the file that describes all three containers and how they fit together. One command starts everything.',
  ),
  code(
    'services:\n' +
      '  # ---------------------------------------------------------- database\n' +
      '  postgres:\n' +
      '    image: postgres:16-alpine\n' +
      '    restart: unless-stopped\n' +
      '    environment:\n' +
      '      POSTGRES_USER: veltrixair\n' +
      '      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}\n' +
      '      POSTGRES_DB: veltrixair\n' +
      '    volumes:\n' +
      '      # Left of the colon: a real folder on the server.\n' +
      '      # Right of the colon: where it appears inside the container.\n' +
      '      - /opt/veltrixair/data/postgres:/var/lib/postgresql/data\n' +
      '      - /opt/veltrixair/backups:/backups\n' +
      '    healthcheck:\n' +
      '      test: ["CMD-SHELL", "pg_isready -U veltrixair -d veltrixair"]\n' +
      '      interval: 10s\n' +
      '      timeout: 5s\n' +
      '      retries: 5\n' +
      '    # No ports. Nothing outside this server can reach the database.\n' +
      '\n' +
      '  # ----------------------------------------------------------- backend\n' +
      '  api:\n' +
      '    build: .\n' +
      '    restart: unless-stopped\n' +
      '    depends_on:\n' +
      '      postgres:\n' +
      '        condition: service_healthy\n' +
      '    env_file:\n' +
      '      - ./config/prod.env\n' +
      '    # No ports either. Only nginx talks to it, over the private network.\n' +
      '\n' +
      '  # ------------------------------------------------ panel + web server\n' +
      '  web:\n' +
      '    build:\n' +
      '      context: ../Veltrixair_AdminPanel_FontendCode\n' +
      '    restart: unless-stopped\n' +
      '    depends_on: [api]\n' +
      '    ports:\n' +
      '      - "80:80"\n' +
      '      - "443:443"\n' +
      '    volumes:\n' +
      '      - /opt/veltrixair/certs:/etc/letsencrypt:ro\n' +
      '      - /opt/veltrixair/certbot-webroot:/var/www/certbot:ro\n' +
      '\n' +
      '  # ----------------------------------------- certificates (on demand)\n' +
      '  # Started by hand, never left running. See section 9.\n' +
      '  certbot:\n' +
      '    image: certbot/certbot:latest\n' +
      '    profiles: ["tools"]\n' +
      '    volumes:\n' +
      '      - /opt/veltrixair/certs:/etc/letsencrypt\n' +
      '      - /opt/veltrixair/certbot-webroot:/var/www/certbot',
  ),
  note(
    'The frontend is built from a folder next to the backend, so both repositories need to be checked out side by side on the server. Section 5 does that.',
  ),

  h2('4.6   config/prod.env   (backend, created ON THE SERVER only)'),
  code(
    'NODE_ENV=production\n' +
      'PORT=3000\n' +
      '\n' +
      '# "postgres" is the container name, not a hostname you have to look up.\n' +
      'DB_HOST=postgres\n' +
      'DB_PORT=5432\n' +
      'DB_USERNAME=veltrixair\n' +
      'DB_PASSWORD=<your POSTGRES_PASSWORD>\n' +
      'DB_NAME=veltrixair\n' +
      '# Off: this connection never leaves the private Docker network.\n' +
      'DB_SSL=false\n' +
      '\n' +
      '# Empty. The panel and the API share one address, so no request is\n' +
      '# ever cross-origin.\n' +
      'CORS_ORIGINS=\n' +
      '\n' +
      '# --- file storage: S3, not Supabase --------------------------------\n' +
      'STORAGE_DRIVER=s3\n' +
      'S3_BUCKET=veltrixair-files\n' +
      'AWS_REGION=me-central-1\n' +
      'SIGNED_URL_TTL_SECONDS=300\n' +
      '# No AWS keys here. The server has an IAM role instead \u2014 see 5.2.\n' +
      '# No SUPABASE_ variables at all.\n' +
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
      'SCAN_REQUIRED=false\n' +
      'MAIL_FROM=no-reply@veltrixair.com',
  ),

  h2('4.7   One line in src/main.ts'),
  p(
    'Add this right after the app is created. It tells the backend that the real visitor address arrives in a header from nginx, rather than being the connection it can see.',
  ),
  code(
    '// nginx is in front, so the socket address is nginx\u2019s. Without this the\n' +
      '// login throttle (5 per minute per IP) treats every user as the same\n' +
      '// person, and a few simultaneous sign-ins start failing with 429.\n' +
      "app.getHttpAdapter().getInstance().set('trust proxy', 1);",
  ),
  warn(
    'This one is easy to skip and hard to diagnose.',
    'Everything works in testing, because you are one person. It fails the morning several people sign in at once, and it looks like the server is down rather than like a configuration problem.',
  ),
  PAGE_BREAK,
);

/* ----------------------------------------------------- 5 AWS setup ------- */

add(
  band('5  \u00b7  SETTING UP AWS'),
  h3('5.1   Create the S3 bucket'),
  code(
    'aws s3 mb s3://veltrixair-files --region me-central-1\n' +
      '\n' +
      '# Make absolutely sure it is private. This is the default, but confirm it.\n' +
      'aws s3api put-public-access-block \\\n' +
      '  --bucket veltrixair-files \\\n' +
      '  --public-access-block-configuration \\\n' +
      '    "BlockPublicAcls=true,IgnorePublicAcls=true,\\\n' +
      'BlockPublicPolicy=true,RestrictPublicBuckets=true"\n' +
      '\n' +
      '# Versioning: a file overwritten by mistake can be recovered.\n' +
      'aws s3api put-bucket-versioning \\\n' +
      '  --bucket veltrixair-files \\\n' +
      '  --versioning-configuration Status=Enabled',
  ),
  h3('5.2   Give the server permission, without putting keys on it'),
  p(
    'An IAM role is a set of permissions you attach to the server itself. The AWS SDK inside your backend finds it automatically. This is better than access keys because there is no secret to leak, and nothing to rotate.',
  ),
  step(1, 'IAM console \u2192 Roles \u2192 Create role.'),
  step(2, 'Trusted entity: AWS service. Use case: EC2.'),
  step(3, 'Skip the policy list for now and name it veltrixair-server. Create it.'),
  step(4, 'Open the role \u2192 Add permissions \u2192 Create inline policy \u2192 JSON, and paste:'),
  code(
    '{\n' +
      '  "Version": "2012-10-17",\n' +
      '  "Statement": [\n' +
      '    {\n' +
      '      "Sid": "FilesBucket",\n' +
      '      "Effect": "Allow",\n' +
      '      "Action": [\n' +
      '        "s3:PutObject",\n' +
      '        "s3:GetObject",\n' +
      '        "s3:DeleteObject"\n' +
      '      ],\n' +
      '      "Resource": "arn:aws:s3:::veltrixair-files/*"\n' +
      '    },\n' +
      '    {\n' +
      '      "Sid": "BackupsBucket",\n' +
      '      "Effect": "Allow",\n' +
      '      "Action": "s3:PutObject",\n' +
      '      "Resource": "arn:aws:s3:::veltrixair-backups/*"\n' +
      '    }\n' +
      '  ]\n' +
      '}',
  ),
  note(
    'Only the three actions the driver actually uses. No ListBucket, no bucket-level permissions, nothing it does not need.',
  ),
  h3('5.3   Launch the server'),
  step(1, 'EC2 \u2192 Launch instance. Name it veltrixair-prod.'),
  step(2, 'Image: Ubuntu Server 24.04 LTS.'),
  step(3, 'Type: t3.small.'),
  step(4, 'Key pair: create one, download the .pem file, keep it safe \u2014 you cannot download it twice.'),
  step(5, 'Storage: change to 30 GB gp3.'),
  step(6, 'Advanced details \u2192 IAM instance profile \u2192 veltrixair-server.'),
  step(7, 'Launch.'),
  warn(
    'Step 6 is the one people miss.',
    'Without the IAM role attached, every file upload fails with an access-denied error that mentions credentials rather than the role. You can attach it afterwards from Actions \u2192 Security \u2192 Modify IAM role, then restart the api container.',
  ),
  h3('5.4   Firewall (the security group)'),
  table(
    ['Port', 'Source', 'Why'],
    [
      ['22', 'My IP', 'SSH, for you. Never open this to the world.'],
      ['80', '0.0.0.0/0', 'HTTP \u2014 redirects to HTTPS, and proves domain ownership'],
      ['443', '0.0.0.0/0', 'HTTPS \u2014 the actual site'],
    ],
    [900, 1900, 5200],
    { monoCols: [0, 1] },
  ),
  p(
    'Ports 3000 and 5432 are deliberately absent, and the compose file publishes neither. Two independent reasons nobody can reach your backend or database directly.',
  ),
  h3('5.5   A fixed address'),
  p(
    'Allocate an Elastic IP and associate it with the instance. Without one, the address changes whenever the server restarts, and both your domain and your certificate stop working.',
  ),
  h3('5.6   Install Docker'),
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
      '# Lets you run docker without sudo. Log out and back in afterwards.\n' +
      'sudo usermod -aG docker ubuntu\n' +
      'exit',
  ),
  code('ssh -i veltrixair-prod.pem ubuntu@<elastic-ip>\ndocker --version && docker compose version'),
  expect('two version numbers, and no permission error.'),
  h3('5.7   Folders and both repositories'),
  code(
    'sudo mkdir -p /opt/veltrixair/{data/postgres,backups,certs,certbot-webroot}\n' +
      'sudo chown -R ubuntu:ubuntu /opt/veltrixair\n' +
      '\n' +
      '# PostgreSQL runs as user 999 inside its container and writes here.\n' +
      'sudo chown -R 999:999 /opt/veltrixair/data/postgres\n' +
      '\n' +
      '# Both repositories, side by side \u2014 the compose file builds the panel\n' +
      '# from ../Veltrixair_AdminPanel_FontendCode.\n' +
      'cd /opt/veltrixair\n' +
      'git clone <backend-repo-url>  VELTRIXAIR.COM-Backend\n' +
      'git clone <frontend-repo-url> Veltrixair_AdminPanel_FontendCode\n' +
      '\n' +
      'cd /opt/veltrixair/VELTRIXAIR.COM-Backend\n' +
      'nano config/prod.env        # paste section 4.6, fill in your secrets\n' +
      'chmod 600 config/prod.env\n' +
      '\n' +
      'echo "POSTGRES_PASSWORD=<same as DB_PASSWORD>" > .env\n' +
      'chmod 600 .env',
  ),
  warn(
    'Ownership 999:999 is the usual reason the database will not start.',
    'PostgreSQL refuses to use a data folder it does not own, and the error talks about lock files and permissions without ever mentioning ownership. Set it before the first start and the problem never appears.',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------ 6 database move -------- */

add(
  band('6  \u00b7  MOVING THE DATABASE', GREEN),
  h3('6.1   Start PostgreSQL on its own first'),
  p(
    'Start the database alone, before anything else. If something is wrong with the volume, you want to find out now and not after the backend has written to it.',
  ),
  code(
    'cd /opt/veltrixair/VELTRIXAIR.COM-Backend\n' +
      'docker compose up -d postgres\n' +
      '\n' +
      'docker compose ps',
  ),
  expect('postgres listed, with a status of "healthy" after ten or twenty seconds.'),
  code('ls -la /opt/veltrixair/data/postgres'),
  expect('folders like base, global and pg_wal, plus a PG_VERSION file.'),
  warn(
    'If that folder is empty, stop.',
    'It means the volume is not connected, and the database is writing inside the container where it will be destroyed on the next rebuild. Fix the volume line in docker-compose.yml before going any further.',
  ),

  h3('6.2   Prove the volume works'),
  p('Worth doing once, now, while there is nothing to lose:'),
  code(
    'docker compose exec postgres psql -U veltrixair -d veltrixair \\\n' +
      '  -c "CREATE TABLE probe (note text); INSERT INTO probe VALUES (\'ok\');"\n' +
      '\n' +
      '# Destroy the container completely and build a new one.\n' +
      'docker compose rm -sf postgres\n' +
      'docker compose up -d postgres\n' +
      '\n' +
      'docker compose exec postgres psql -U veltrixair -d veltrixair \\\n' +
      '  -c "SELECT * FROM probe;"',
  ),
  expect('the row "ok" \u2014 the data outlived the container.'),
  code(
    'docker compose exec postgres psql -U veltrixair -d veltrixair \\\n' +
      '  -c "DROP TABLE probe;"',
  ),

  h3('6.3   Copy the data out of Supabase'),
  p('Run this on your own computer, where Supabase already works:'),
  code(
    'pg_dump \\\n' +
      '  --host=db.<your-project-ref>.supabase.co \\\n' +
      '  --port=5432 \\\n' +
      '  --username=postgres \\\n' +
      '  --dbname=postgres \\\n' +
      '  --no-owner --no-privileges \\\n' +
      '  --format=custom \\\n' +
      '  --file=veltrixair.dump',
  ),
  p(
    '--no-owner and --no-privileges matter. Supabase has its own internal user accounts that do not exist on your server, and without these flags the restore fails on every permission line.',
  ),

  h3('6.4   Send it to the server and restore it'),
  code(
    '# From your computer:\n' +
      'scp -i veltrixair-prod.pem veltrixair.dump \\\n' +
      '    ubuntu@<elastic-ip>:/opt/veltrixair/backups/\n' +
      '\n' +
      '# Then on the server:\n' +
      'cd /opt/veltrixair/VELTRIXAIR.COM-Backend\n' +
      'docker compose exec postgres pg_restore \\\n' +
      '  --username=veltrixair --dbname=veltrixair \\\n' +
      '  --no-owner --no-privileges --verbose \\\n' +
      '  /backups/veltrixair.dump',
  ),
  note(
    'Errors mentioning pgsodium, supabase_vault or similar are expected \u2014 those are Supabase\u2019s own extensions and you do not need them. Errors mentioning your own tables (admins, employees, crane_quotes) are not expected, and mean something went wrong.',
  ),

  h3('6.5   Apply any pending migrations'),
  p(
    'The application never changes its own schema \u2014 synchronize and migrationsRun are both switched off in the code. That is deliberate on a database holding customer records, and it means migrating is always something you choose to do.',
  ),
  code(
    'docker compose run --rm api npm run migration:run\n' +
      'docker compose run --rm api npm run migration:show',
  ),
  expect('every migration marked [X], and nothing pending.'),

  h3('6.6   Check the data arrived'),
  code(
    'docker compose exec postgres psql -U veltrixair -d veltrixair -c "\n' +
      "  SELECT 'admins' t, count(*) FROM admins\n" +
      "  UNION ALL SELECT 'employees', count(*) FROM employees\n" +
      "  UNION ALL SELECT 'stored_files', count(*) FROM stored_files\n" +
      "  UNION ALL SELECT 'crane_quotes', count(*) FROM crane_quotes;\"",
  ),
  p('Compare these against Supabase. They should match exactly.'),

  h3('6.7   Point all three dashboards at the one address'),
  code(
    'docker compose exec postgres psql -U veltrixair -d veltrixair -c "\n' +
      "  UPDATE site_masters SET admin_domain = 'admin.veltrixair.com'\n" +
      '   WHERE site_code IN (101, 102, 103);"',
  ),
  PAGE_BREAK,
);

/* --------------------------------------------------- 7 files move -------- */

add(
  band('7  \u00b7  MOVING THE FILES TO S3', GREEN),
  warn(
    'A database dump does not contain your files.',
    'The stored_files table holds names and keys \u2014 the actual PDFs and images live in the Supabase Storage bucket. Restoring the database alone gives you 47 rows pointing at nothing. This section is not optional.',
  ),
  h2('How the backend decides where to read from'),
  p(
    'Worth understanding before you start, because it determines what "done" means here. Each row in stored_files has a storage_driver column recording which driver saved it \u2014 but nothing ever reads that column. Every download goes through whichever driver is configured right now.',
  ),
  idea(
    'What that means in practice',
    'The moment you set STORAGE_DRIVER=s3, the backend looks for every file in S3, including ones uploaded to Supabase years ago. There is no gradual migration and no fallback. Either a file is in S3 or its download is broken \u2014 so copy everything across before you switch, not after.',
  ),
  h3('7.1   The migration script'),
  p('Create scripts/migrate-files-to-s3.js in the backend repository:'),
  code(
    '/**\n' +
      ' * Copies every file from Supabase Storage into S3, keeping the same key.\n' +
      ' *\n' +
      ' *   node scripts/migrate-files-to-s3.js\n' +
      ' *\n' +
      ' * Safe to run more than once: it checks S3 first and skips anything\n' +
      ' * already there, so an interrupted run can simply be restarted.\n' +
      ' */\n' +
      "require('ts-node/register');\n" +
      "require('dotenv').config({ path: 'config/dev.env' });\n" +
      '\n' +
      "const { AppDataSource } = require('../src/data-source.ts');\n" +
      'const {\n' +
      '  S3Client, PutObjectCommand, HeadObjectCommand,\n' +
      "} = require('@aws-sdk/client-s3');\n" +
      '\n' +
      "const SUPABASE_URL = process.env.SUPABASE_URL.replace(/\\/+$/, '');\n" +
      'const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;\n' +
      "const SRC_BUCKET   = process.env.SUPABASE_STORAGE_BUCKET || 'veltrixair-assets';\n" +
      'const DST_BUCKET   = process.env.S3_BUCKET;\n' +
      '\n' +
      'const s3 = new S3Client({ region: process.env.AWS_REGION });\n' +
      '\n' +
      'const alreadyThere = async (key) => {\n' +
      '  try {\n' +
      '    await s3.send(new HeadObjectCommand({ Bucket: DST_BUCKET, Key: key }));\n' +
      '    return true;\n' +
      '  } catch {\n' +
      '    return false;\n' +
      '  }\n' +
      '};\n' +
      '\n' +
      '(async () => {\n' +
      '  await AppDataSource.initialize();\n' +
      '\n' +
      '  const files = await AppDataSource.query(\n' +
      "    'SELECT storage_key, mime_type FROM stored_files WHERE is_deleted = false',\n" +
      '  );\n' +
      '  console.log(`${files.length} files to move\\n`);\n' +
      '\n' +
      '  let moved = 0, skipped = 0, failed = 0;\n' +
      '\n' +
      '  for (const f of files) {\n' +
      '    const key = f.storage_key;\n' +
      '\n' +
      '    if (await alreadyThere(key)) {\n' +
      '      console.log(`  skip  ${key}`);\n' +
      '      skipped += 1;\n' +
      '      continue;\n' +
      '    }\n' +
      '\n' +
      '    try {\n' +
      '      const res = await fetch(\n' +
      '        `${SUPABASE_URL}/storage/v1/object/${SRC_BUCKET}/${key}`,\n' +
      '        { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } },\n' +
      '      );\n' +
      '      if (!res.ok) throw new Error(`download ${res.status}`);\n' +
      '\n' +
      '      const body = Buffer.from(await res.arrayBuffer());\n' +
      '\n' +
      '      await s3.send(new PutObjectCommand({\n' +
      '        Bucket: DST_BUCKET,\n' +
      '        Key: key,\n' +
      '        Body: body,\n' +
      "        ContentType: f.mime_type || 'application/octet-stream',\n" +
      '      }));\n' +
      '\n' +
      '      console.log(`  ok    ${key}  (${(body.length / 1024).toFixed(0)} KB)`);\n' +
      '      moved += 1;\n' +
      '    } catch (e) {\n' +
      '      console.log(`  FAIL  ${key}  ${e.message}`);\n' +
      '      failed += 1;\n' +
      '    }\n' +
      '  }\n' +
      '\n' +
      '  // Not read by the application, but keeps the record honest.\n' +
      '  if (failed === 0) {\n' +
      '    await AppDataSource.query(\n' +
      '      "UPDATE stored_files SET storage_driver = \'s3\' WHERE is_deleted = false",\n' +
      '    );\n' +
      '  }\n' +
      '\n' +
      '  console.log(`\\n${moved} moved, ${skipped} already there, ${failed} failed`);\n' +
      '  await AppDataSource.destroy();\n' +
      '  process.exit(failed === 0 ? 0 : 1);\n' +
      '})();',
  ),
  h3('7.2   Run it from your computer'),
  p(
    'Run this locally, not on the server \u2014 your laptop still has the Supabase keys, and the server deliberately does not.',
  ),
  code(
    'cd C:\\VELTRIXAIR.COM-Backend\n' +
      '\n' +
      '# Your AWS credentials, so the script can write to S3.\n' +
      'set AWS_REGION=me-central-1\n' +
      'set S3_BUCKET=veltrixair-files\n' +
      '\n' +
      'node scripts/migrate-files-to-s3.js',
  ),
  expect('a line per file, then "47 moved, 0 already there, 0 failed".'),
  h3('7.3   Check S3 actually has them'),
  code(
    'aws s3 ls s3://veltrixair-files/ --recursive --summarize | tail -5',
  ),
  expect('a total object count matching the number the script reported.'),
  note(
    'Leave the files in Supabase for a few weeks. Storage is cheap and a second copy costs nothing until you are certain everything works.',
  ),
  PAGE_BREAK,
);

/* --------------------------------------------------- 8 start up ---------- */

add(
  band('8  \u00b7  STARTING EVERYTHING'),
  h3('8.1   Build and start the backend'),
  code(
    'cd /opt/veltrixair/VELTRIXAIR.COM-Backend\n' +
      'docker compose build api\n' +
      'docker compose up -d api\n' +
      'docker compose logs -f api',
  ),
  expect(
    'the lines "Using S3 \u2014 bucket veltrixair-files", "Nest application successfully started" and "running on port 3000".',
  ),
  warn(
    'If the log says "Using local filesystem storage", stop.',
    'STORAGE_DRIVER is not reaching the container. Check config/prod.env has STORAGE_DRIVER=s3 and that the env_file path in docker-compose.yml is right. Carry on and uploads will silently go to a folder inside the container and vanish on the next rebuild.',
  ),
  h3('8.2   Check the backend from inside the server'),
  code(
    'docker compose exec api wget -qO- http://localhost:3000/admin/auth/login-options',
  ),
  expect('five roles \u2014 SUPER_ADMIN, CONTENT_EDITOR, RECRUITER, SALES, VIEWER \u2014 and not PENDING.'),
  h3('8.3   Build and start the panel'),
  p(
    'This needs the certificate to exist already, because nginx will not start with a missing certificate file. So: do section 9 first, then come back and run this.',
  ),
  code('docker compose build web\ndocker compose up -d web\ndocker compose ps'),
  expect('three containers running: postgres, api and web.'),
  PAGE_BREAK,
);

/* -------------------------------------------------- 9 domain + TLS ------- */

add(
  band('9  \u00b7  DOMAIN AND HTTPS'),
  h3('9.1   Point the domain at the server'),
  p('In Hostinger, open the DNS zone for veltrixair.com and add one record:'),
  table(
    ['Type', 'Name', 'Value', 'TTL'],
    [['A', 'admin', '<your Elastic IP>', '3600']],
    [900, 1400, 3900, 1800],
    { monoCols: [0, 1, 2, 3] },
  ),
  warn(
    'Type "admin", not "admin.veltrixair.com".',
    'Hostinger adds the domain for you. Typing the full name produces admin.veltrixair.com.veltrixair.com, which resolves to nothing and is a genuinely confusing hour to debug.',
  ),
  code('nslookup admin.veltrixair.com'),
  expect('your Elastic IP. If not, wait a few minutes and try again.'),

  h3('9.2   Get the certificate'),
  p(
    'A chicken-and-egg problem: nginx will not start without a certificate, and the certificate tool needs a web server to prove you own the domain. Solve it by running a temporary web server for sixty seconds.',
  ),
  code(
    'cd /opt/veltrixair/VELTRIXAIR.COM-Backend\n' +
      '\n' +
      '# A bare nginx on port 80, just to answer the challenge.\n' +
      'docker run --rm -d --name tmp-web -p 80:80 \\\n' +
      '  -v /opt/veltrixair/certbot-webroot:/usr/share/nginx/html \\\n' +
      '  nginx:1.27-alpine\n' +
      '\n' +
      'docker compose --profile tools run --rm certbot certonly \\\n' +
      '  --webroot --webroot-path=/var/www/certbot \\\n' +
      '  -d admin.veltrixair.com \\\n' +
      '  --email you@veltrixair.com \\\n' +
      '  --agree-tos --no-eff-email\n' +
      '\n' +
      'docker stop tmp-web',
  ),
  expect('"Successfully received certificate" and a path under /etc/letsencrypt/live/.'),
  code('sudo ls /opt/veltrixair/certs/live/admin.veltrixair.com/'),
  expect('fullchain.pem and privkey.pem.'),

  h3('9.3   Now start the panel'),
  code('docker compose build web\ndocker compose up -d web'),
  code('curl -I https://admin.veltrixair.com'),
  expect('HTTP/2 200.'),

  h3('9.4   Keep the certificate renewed'),
  p(
    "Let's Encrypt certificates last ninety days. This checks twice a day and renews when there is a month left, then reloads nginx so it picks up the new file.",
  ),
  code(
    'crontab -e\n' +
      '\n' +
      '# Renew certificates and reload nginx if anything changed.\n' +
      '0 3,15 * * *  cd /opt/veltrixair/VELTRIXAIR.COM-Backend && \\\n' +
      '  docker compose --profile tools run --rm certbot renew --webroot \\\n' +
      '  --webroot-path=/var/www/certbot --quiet && \\\n' +
      '  docker compose exec -T web nginx -s reload',
  ),
  code(
    'docker compose --profile tools run --rm certbot renew --dry-run',
  ),
  expect('a simulated renewal that succeeds.'),
  PAGE_BREAK,
);

/* --------------------------------------------------- 10 backups ---------- */

add(
  band('10  \u00b7  BACKUPS', GREEN),
  h2('What you are protected against, and what you are not'),
  table(
    ['If this happens', 'Volume only', 'With backups'],
    [
      ['You rebuild a container', 'Fine', 'Fine'],
      ['Someone deletes a table by mistake', 'Gone', 'Restored from last night'],
      ['The disk corrupts', 'Gone', 'Restored'],
      ['The server is terminated', 'Gone', 'Restored'],
    ],
    [3000, 2000, 3000],
  ),
  p(
    'The volume keeps your data safe from Docker. It does not keep it safe from you, or from Amazon. That is what this section is for.',
  ),
  h3('10.1   A bucket for backups'),
  code(
    'aws s3 mb s3://veltrixair-backups --region me-central-1\n' +
      'aws s3api put-bucket-versioning --bucket veltrixair-backups \\\n' +
      '  --versioning-configuration Status=Enabled',
  ),
  h3('10.2   The backup script'),
  code(
    "sudo tee /opt/veltrixair/backup.sh > /dev/null <<'EOF'\n" +
      '#!/usr/bin/env bash\n' +
      'set -euo pipefail\n' +
      '\n' +
      'STAMP=$(date +%Y%m%d-%H%M)\n' +
      'DIR=/opt/veltrixair/backups\n' +
      '\n' +
      'cd /opt/veltrixair/VELTRIXAIR.COM-Backend\n' +
      '\n' +
      '# -T is required from cron: without a terminal attached the command\n' +
      '# fails, and it fails silently at two in the morning.\n' +
      'docker compose exec -T postgres pg_dump \\\n' +
      '  --username=veltrixair --dbname=veltrixair \\\n' +
      '  --no-owner --no-privileges --format=custom \\\n' +
      '  > "$DIR/db-$STAMP.dump"\n' +
      '\n' +
      '# Off the server. A backup on the same disk as the database is not\n' +
      '# a backup \u2014 it dies with the thing it was protecting.\n' +
      'aws s3 cp "$DIR/db-$STAMP.dump" s3://veltrixair-backups/db/\n' +
      '\n' +
      'find "$DIR" -name "db-*.dump" -mtime +14 -delete\n' +
      'echo "$(date -Iseconds)  backup ok  $STAMP"\n' +
      'EOF\n' +
      '\n' +
      'sudo chmod +x /opt/veltrixair/backup.sh\n' +
      'sudo chown ubuntu:ubuntu /opt/veltrixair/backup.sh',
  ),
  note(
    'The uploaded files do not need backing up here \u2014 they are already in S3, and S3 versioning is switched on. That is one of the quieter benefits of moving them off the server.',
  ),
  h3('10.3   Run it once by hand, then schedule it'),
  code('/opt/veltrixair/backup.sh\naws s3 ls s3://veltrixair-backups/db/'),
  code(
    'crontab -e\n' +
      '\n' +
      '# 02:30 every night.\n' +
      '30 2 * * *  /opt/veltrixair/backup.sh >> /var/log/veltrixair-backup.log 2>&1',
  ),
  h3('10.4   Practise restoring \u2014 this is the part people skip'),
  p(
    'A backup nobody has restored is a guess. Do this once now, while it does not matter, so that the day it does matter you have done it before.',
  ),
  code(
    'cd /opt/veltrixair/VELTRIXAIR.COM-Backend\n' +
      '\n' +
      '# Into a scratch database, never over the live one.\n' +
      'docker compose exec postgres createdb -U veltrixair restore_test\n' +
      '\n' +
      'docker compose exec -T postgres pg_restore \\\n' +
      '  --username=veltrixair --dbname=restore_test \\\n' +
      '  --no-owner --no-privileges \\\n' +
      '  < /opt/veltrixair/backups/db-<stamp>.dump\n' +
      '\n' +
      'docker compose exec postgres psql -U veltrixair -d restore_test \\\n' +
      '  -c "SELECT count(*) FROM admins;"\n' +
      '\n' +
      'docker compose exec postgres dropdb -U veltrixair restore_test',
  ),
  expect('the same number of admins as the live database.'),
  h3('10.5   Snapshot the whole server too'),
  p(
    'EC2 \u2192 Lifecycle Manager \u2192 create a policy for this instance: daily snapshots, keep seven. A dump restores your data; a snapshot restores the entire machine in minutes without you following this guide again.',
  ),
  PAGE_BREAK,
);

/* -------------------------------------------------- 11 verify ------------ */

add(
  band('11  \u00b7  CHECKING IT ALL WORKS'),
  p('Work down the list. Every line is something that has gone wrong for somebody.'),
  h3('The containers'),
  bullet('docker compose ps shows three running, and postgres healthy'),
  bullet('The api log says "Using S3", not "Using local filesystem storage"'),
  bullet('curl http://<elastic-ip>:3000 from your own computer fails to connect'),
  bullet('curl http://<elastic-ip>:5432 from your own computer fails to connect'),
  h3('The site'),
  bullet('https://admin.veltrixair.com loads the login screen'),
  bullet('http://admin.veltrixair.com redirects to https'),
  bullet('The browser shows a padlock with no warning'),
  h3('Signing in'),
  bullet('Pick IT, sign in with an IT account, land on the IT dashboard'),
  bullet('Sign out, pick Crane, sign in with a crane account, get the crane dashboard'),
  bullet('Pick a unit you have no access to and get a clear refusal'),
  bullet('Refresh the page on a deep link \u2014 you get the page, not a 404'),
  h3('Files \u2014 the part this migration was for'),
  bullet('Open a candidate who applied before the move and download their CV'),
  bullet('Upload a new document, then find it with aws s3 ls'),
  bullet('Download the new document back again'),
  h3('Everything else'),
  bullet('Six people sign in within a minute and nobody sees an error'),
  bullet('The profile screen shows admin.veltrixair.com'),
  bullet('backup.sh has run and the dump is in S3'),
  bullet('A restore into restore_test worked and the counts matched'),
  PAGE_BREAK,
);

/* -------------------------------------------------- 12 day to day -------- */

add(
  band('12  \u00b7  DAY-TO-DAY'),
  h3('Deploy a backend change'),
  code(
    'ssh -i veltrixair-prod.pem ubuntu@<elastic-ip>\n' +
      'cd /opt/veltrixair/VELTRIXAIR.COM-Backend\n' +
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
  h3('Deploy a panel change'),
  code(
    'cd /opt/veltrixair/Veltrixair_AdminPanel_FontendCode\n' +
      'git pull\n' +
      '\n' +
      'cd /opt/veltrixair/VELTRIXAIR.COM-Backend\n' +
      'docker compose build web\n' +
      'docker compose up -d web',
  ),
  note(
    'Tell people to refresh with Ctrl+Shift+R the first time. index.html is not cached, but their browser may still be holding the old one for a few minutes.',
  ),
  h3('Look at the logs'),
  code(
    'docker compose logs -f api          # backend, live\n' +
      'docker compose logs --tail 100 web  # nginx\n' +
      'docker compose logs postgres        # database\n' +
      'tail -f /var/log/veltrixair-backup.log',
  ),
  h3('Restart something'),
  code(
    'docker compose restart api\n' +
      'docker compose restart\n' +
      '\n' +
      '# After editing nginx.conf you must rebuild \u2014 it is inside the image.\n' +
      'docker compose build web && docker compose up -d web',
  ),
  h3('Go back to the previous release'),
  code(
    'git log --oneline -5\n' +
      'git checkout <previous-commit>\n' +
      'docker compose build api && docker compose up -d api',
  ),
  warn(
    'Going back does not undo a migration.',
    'If the release you are reversing added one, revert it deliberately with docker compose run --rm api npm run migration:revert \u2014 and read what it drops before you run it.',
  ),
  h3('Restore the database'),
  code(
    'docker compose stop api        # stop writes; leave postgres running\n' +
      '\n' +
      'docker compose exec -T postgres pg_restore \\\n' +
      '  --username=veltrixair --dbname=veltrixair \\\n' +
      '  --clean --if-exists --no-owner --no-privileges \\\n' +
      '  < /opt/veltrixair/backups/db-<stamp>.dump\n' +
      '\n' +
      'docker compose start api',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------- 13 troubleshooting ---- */

add(
  band('13  \u00b7  WHEN SOMETHING GOES WRONG', RUST),
  p(
    'Almost everything that breaks in this setup is one of these. The symptom rarely points at the cause, which is why they are worth reading before you need them.',
  ),
  table(
    ['What you see', 'What it usually is'],
    [
      [
        'Every API call returns 404',
        'The trailing slash is missing from proxy_pass in nginx.conf. It must be http://api:3000/ \u2014 see 4.4.',
      ],
      [
        'The site loads, refreshing a page 404s',
        'try_files is missing /index.html at the end.',
      ],
      [
        'postgres container will not start',
        'Ownership. Run sudo chown -R 999:999 /opt/veltrixair/data/postgres.',
      ],
      [
        'api cannot reach the database',
        'DB_HOST must be postgres \u2014 the container name \u2014 not localhost.',
      ],
      [
        'Uploads fail with access denied',
        'The IAM role is not attached, or the policy names the wrong bucket. Attach it, then restart api.',
      ],
      [
        'Old files 404 on download',
        'They were never copied to S3. Run the script in section 7.',
      ],
      [
        'Log says "Using local filesystem storage"',
        'STORAGE_DRIVER=s3 is not reaching the container. Check config/prod.env and env_file.',
      ],
      [
        '429 errors when several people sign in',
        'trust proxy is missing from main.ts \u2014 see 4.7.',
      ],
      [
        'nginx will not start',
        'The certificate does not exist yet. Do section 9.2 first.',
      ],
      [
        'Browser warns the certificate is invalid',
        'It was issued for a different name, or DNS points somewhere else. Check nslookup.',
      ],
      [
        'Changes to nginx.conf do nothing',
        'It lives inside the web image. Rebuild: docker compose build web.',
      ],
      [
        'Site down after a reboot',
        'It should not be \u2014 restart: unless-stopped brings everything back. If not, docker compose up -d.',
      ],
    ],
    [2600, 5400],
  ),
  h2('Two commands that tell you most things'),
  code(
    'docker compose ps            # what is running, and is it healthy\n' +
      'docker compose logs --tail 50 api',
  ),
  h2('Starting over safely'),
  code(
    '# Stops and removes the containers. Your data folder is untouched.\n' +
      'docker compose down\n' +
      'docker compose up -d',
  ),
  warn(
    'Never add -v to that command.',
    'docker compose down -v removes volumes. Build the habit of typing it without the flag, every time.',
  ),
  PAGE_BREAK,
);

/* ------------------------------------------------------- glossary -------- */

add(
  band('GLOSSARY'),
  table(
    ['Term', 'What it means here'],
    [
      ['Image', 'A frozen snapshot of your app and everything it needs to run'],
      ['Container', 'One running copy of an image'],
      ['Volume', 'A folder on the server that a container can read and write'],
      ['Bind mount', 'A volume that is an ordinary folder you can see and copy'],
      ['docker compose', 'Runs several containers together from one file'],
      ['EC2', 'A rented computer in Amazon\u2019s data centre'],
      ['Elastic IP', 'An address that stays the same when the server restarts'],
      ['S3', 'Amazon\u2019s file storage. A bucket is one container of files.'],
      ['IAM role', 'Permissions attached to the server, so no keys are stored'],
      ['Presigned URL', 'A link to a private file that stops working after a while'],
      ['Security group', 'The firewall around the server'],
      ['nginx', 'The web server that serves the panel and forwards API calls'],
      ['Reverse proxy', 'A server that passes requests on to another server'],
      ['Migration', 'A recorded change to the database structure'],
      ['pg_dump', 'Copies a database into a file'],
      ['pg_restore', 'Puts that file back into a database'],
      ['Certbot', 'Gets and renews free HTTPS certificates'],
    ],
    [2000, 6000],
  ),

  band('WHAT THIS SETUP DOES NOT GIVE YOU', RUST),
  p(
    'This is a sound way to run the project and it will serve all three units comfortably. Worth knowing the limits now rather than during an incident.',
  ),
  h3('One server means one point of failure'),
  p(
    'All three containers share a machine. If it fails, everything is down until you build a new one. With a daily snapshot that is well under an hour, but it is neither automatic nor instant.',
  ),
  h3('Your backups are the whole safety net'),
  p(
    'A managed database would let you rewind to any moment. Here the worst case is losing everything since 02:30. If that stops being acceptable, move PostgreSQL to Amazon RDS \u2014 the application needs no change beyond DB_HOST and DB_SSL, because the config already switches SSL on automatically for an rds.amazonaws.com address.',
  ),
  h3('The database and the backend share memory'),
  p(
    'Two gigabytes between them on a t3.small. Fine at today\u2019s volumes; watch it as the tables grow, and treat constant swapping as the sign to separate them.',
  ),
  h3('Email still does not send'),
  p(
    'This is not a deployment problem and this guide does not fix it, but you will hear about it on day one. The mail service writes to the log instead of sending. Staff invitations, urgent-quote alerts and password resets all appear to work and never arrive. Amazon SES is the natural fit once you are on AWS.',
  ),
  note(
    'Generated from the code at C:\\VELTRIXAIR.COM-Backend and C:\\Veltrixair_AdminPanel_FontendCode. Re-run scripts/build-aws-migration-docx.js after changing the deployment shape.',
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
  `<dc:title>Veltrixair \u2014 Moving to AWS</dc:title>` +
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
