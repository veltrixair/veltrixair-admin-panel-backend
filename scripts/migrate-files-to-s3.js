/**
 * Copies every stored file out of Supabase Storage and into S3.
 *
 *   node scripts/migrate-files-to-s3.js --dry-run    rehearse, write nothing
 *   node scripts/migrate-files-to-s3.js              do it
 *
 * Run this from a development machine, not the server. It needs the Supabase
 * service-role key to read, and the server is deliberately never given one.
 *
 * WHY THIS HAS TO HAPPEN BEFORE THE SWITCH, NOT AFTER
 *
 * `stored_files` records which driver wrote each row, but nothing ever reads
 * that column — every download goes through whichever driver is configured at
 * the time. So the moment STORAGE_DRIVER=s3 takes effect, the backend looks in
 * S3 for every file it has ever stored, including ones written to Supabase
 * years ago. There is no per-file fallback: a file is either in S3 or its
 * download is broken.
 *
 * The object key is preserved exactly, so no database row needs rewriting —
 * only the bytes move.
 *
 * Safe to run repeatedly. Each key is checked in S3 first and skipped if it is
 * already there, so an interrupted run is resumed by running it again.
 */

require('ts-node/register');
require('dotenv').config({ path: 'config/dev.env' });

const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { AppDataSource } = require('../src/data-source.ts');

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SRC_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET || 'veltrixair-assets';

const DST_BUCKET = process.env.S3_BUCKET || '';
const REGION = process.env.AWS_REGION || '';

/** Refuse early and specifically, rather than failing on the first file. */
function checkConfig() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!DST_BUCKET) missing.push('S3_BUCKET');
  if (!REGION) missing.push('AWS_REGION');

  if (missing.length) {
    console.error(`\nMissing configuration: ${missing.join(', ')}\n`);
    console.error('SUPABASE_* come from config/dev.env.');
    console.error('S3_BUCKET and AWS_REGION are set in the shell:\n');
    console.error('  Windows   set S3_BUCKET=veltrixair-files');
    console.error('            set AWS_REGION=me-central-1');
    console.error('  bash      export S3_BUCKET=veltrixair-files');
    console.error('            export AWS_REGION=me-central-1\n');
    process.exit(1);
  }
}

// maxAttempts: 1 — the default of three turns every credential problem into
// a long silent retry loop against an EC2 metadata endpoint that is not there.
const s3 = () => new S3Client({ region: REGION, maxAttempts: 1 });

/**
 * Resolve AWS credentials before touching anything, with a deadline.
 *
 * Without this the first HEAD hangs for minutes: the SDK's credential chain
 * ends at the EC2 instance-metadata service, which on a laptop is simply an
 * address nobody answers, and each attempt waits out its own timeout. A clear
 * failure in five seconds is worth far more than a correct one in four
 * minutes that looks like a crash.
 */
async function requireCredentials(client) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timed out')), 5000),
  );

  try {
    await Promise.race([client.config.credentials(), timeout]);
  } catch {
    console.error('\nNo AWS credentials found.\n');
    console.error('Run `aws configure`, or set them for this shell:\n');
    console.error('  Windows   set AWS_ACCESS_KEY_ID=...');
    console.error('            set AWS_SECRET_ACCESS_KEY=...');
    console.error('  bash      export AWS_ACCESS_KEY_ID=...');
    console.error('            export AWS_SECRET_ACCESS_KEY=...\n');
    process.exit(1);
  }
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

/** Is the object already in S3? A HEAD is cheap and makes reruns free. */
async function alreadyInS3(client, key) {
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: DST_BUCKET, Key: key }),
    );
    return true;
  } catch {
    // NotFound, and also AccessDenied on a bucket with no ListBucket grant.
    // Treating both as "not there" is right: the upload that follows will
    // fail loudly if it is really a permissions problem.
    return false;
  }
}

async function downloadFromSupabase(key) {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${SRC_BUCKET}/${key}`,
    {
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`download ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

(async () => {
  checkConfig();

  console.log(
    `\n${DRY_RUN ? 'DRY RUN — nothing will be written' : 'Migrating files'}`,
  );
  console.log(`  from  supabase://${SRC_BUCKET}`);
  console.log(`  to    s3://${DST_BUCKET}  (${REGION})\n`);

  const client = s3();
  await requireCredentials(client);

  await AppDataSource.initialize();

  const files = await AppDataSource.query(
    `SELECT storage_key, mime_type, size_bytes
       FROM stored_files
      WHERE is_deleted = false
      ORDER BY created_date`,
  );

  console.log(`${files.length} files to consider\n`);

  let moved = 0;
  let skipped = 0;
  let failed = 0;
  let bytes = 0;

  for (const file of files) {
    const key = file.storage_key;

    try {
      if (await alreadyInS3(client, key)) {
        console.log(`  skip   ${key}`);
        skipped += 1;
        continue;
      }

      const body = await downloadFromSupabase(key);

      if (DRY_RUN) {
        console.log(`  would  ${key}  (${kb(body.length)})`);
        moved += 1;
        bytes += body.length;
        continue;
      }

      await client.send(
        new PutObjectCommand({
          Bucket: DST_BUCKET,
          Key: key,
          Body: body,
          ContentType: file.mime_type || 'application/octet-stream',
        }),
      );

      console.log(`  ok     ${key}  (${kb(body.length)})`);
      moved += 1;
      bytes += body.length;
    } catch (error) {
      // One bad file must not abort the run — the rest are still worth moving,
      // and the failures are listed again at the end.
      console.log(`  FAIL   ${key}  ${error.message}`);
      failed += 1;
    }
  }

  /*
   * Only once everything is across. The column is not read by the application,
   * so this is record-keeping rather than a switch — but a half-updated table
   * would be a misleading thing to leave behind.
   */
  if (!DRY_RUN && failed === 0 && moved > 0) {
    await AppDataSource.query(
      `UPDATE stored_files SET storage_driver = 's3' WHERE is_deleted = false`,
    );
    console.log('\nstored_files.storage_driver set to s3');
  }

  console.log(
    `\n${moved} ${DRY_RUN ? 'would move' : 'moved'}, ` +
      `${skipped} already there, ${failed} failed` +
      (bytes ? `  (${(bytes / 1048576).toFixed(1)} MB)` : ''),
  );

  if (failed > 0) {
    console.log('\nRe-run to retry the failures — anything already copied is skipped.');
  }

  await AppDataSource.destroy();
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error('\n', error);
  process.exit(1);
});
