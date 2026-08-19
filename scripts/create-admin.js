/**
 * Creates a staff account, or changes an existing one's password / role.
 *
 *   node scripts/create-admin.js --email a@veltrixair.com --name "Adil Bakshi" --role SUPER_ADMIN
 *   node scripts/create-admin.js --email a@veltrixair.com --role SALES --site INDUSTRIES --add-role
 *   node scripts/create-admin.js --email a@veltrixair.com --reset-password
 *
 * `--site` picks the dashboard the badge is for: IT (default), INDUSTRIES or
 * PRIVACY. A person needs one badge per brand they work on.
 *
 * This exists because the first account has a bootstrap problem: creating an
 * admin requires being an admin. Rather than seeding a default password into a
 * migration — which then lives in git and, invariably, in production — the
 * first account is made deliberately, from a machine with database access.
 *
 * The password is never taken from the command line. Arguments end up in shell
 * history and in the process list, where any other user on the box can read
 * them. It is either prompted for with echo off, or generated here and printed
 * once.
 */

require('dotenv').config({
  path:
    process.env.NODE_ENV === 'production'
      ? 'config/prod.env'
      : 'config/dev.env',
});

const argon2 = require('argon2');
const crypto = require('crypto');
const readline = require('readline');
const { Client } = require('pg');

// Must match ARGON2_OPTIONS in src/auth/password.constants.ts. A hash written here at
// different parameters still verifies — argon2 records its own cost — but it
// would be rewritten at the account's first login for no reason.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const ROLES = {
  SUPER_ADMIN: 101,
  CONTENT_EDITOR: 102,
  RECRUITER: 103,
  SALES: 104,
  VIEWER: 105,
};

/** Which dashboard the badge is for. Defaults to IT, where everything began. */
const SITES = {
  IT: 101,
  INDUSTRIES: 102,
  PRIVACY: 103,
};

function arg(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
}
const has = (flag) => process.argv.includes(flag);

/** Reads a whole piped stdin, for `echo "…" | node scripts/create-admin.js …`. */
function readPipedInput() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

/** Reads a line without echoing it, so the password never appears on screen. */
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const onData = (char) => {
      // Stop muting once the line is submitted, or the next prompt is invisible.
      if (['\n', '\r', ''].includes(char.toString('utf8'))) {
        process.stdin.removeListener('data', onData);
      } else {
        readline.moveCursor(process.stdout, -100, 0);
        readline.clearLine(process.stdout, 1);
        process.stdout.write(question);
      }
    };
    process.stdin.on('data', onData);
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function readPassword() {
  if (has('--generate')) {
    // 24 random bytes, base64url: ~144 bits. Nothing to memorise — it goes
    // straight into a password manager and is changed at first login.
    const generated = crypto.randomBytes(24).toString('base64url');
    console.log(`\n  Generated password: ${generated}`);
    console.log('  Copy it now — it is not stored anywhere in readable form.\n');
    return generated;
  }

  // Without a terminal there is nothing to prompt — the hidden-input trick
  // needs one. Rather than hang on a prompt nobody can see, read the password
  // from stdin, which is what a pipe or a CI runner would give us.
  if (!process.stdin.isTTY) {
    const piped = (await readPipedInput()).split('\n')[0].trim();
    if (piped.length < 12) {
      throw new Error(
        'No terminal available. Pipe a password of at least 12 characters, e.g.\n' +
          '    echo "your-long-passphrase" | npm run admin:create -- --email ... --reset-password\n' +
          '  or use --generate to have one made for you.',
      );
    }
    return piped;
  }

  const first = await promptHidden('  Password (min 12 chars): ');
  if (first.length < 12) {
    throw new Error('Password must be at least 12 characters.');
  }
  const second = await promptHidden('  Confirm password:       ');
  if (first !== second) {
    throw new Error('Passwords did not match.');
  }
  return first;
}

(async () => {
  const email = (arg('--email') || '').trim().toLowerCase();
  const fullName = arg('--name');
  const roleName = (arg('--role') || 'SUPER_ADMIN').toUpperCase();
  const siteName = (arg('--site') || 'IT').toUpperCase();
  const resetOnly = has('--reset-password');
  const addRole = has('--add-role');

  if (!email || !email.includes('@')) {
    throw new Error('--email is required, e.g. --email admin@veltrixair.com');
  }
  if (!SITES[siteName]) {
    throw new Error(`--site must be one of: ${Object.keys(SITES).join(', ')}`);
  }
  if (!ROLES[roleName]) {
    throw new Error(
      `--role must be one of: ${Object.keys(ROLES).join(', ')}`,
    );
  }

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    const existing = await client.query(
      'SELECT id, full_name FROM admins WHERE email = $1 AND is_deleted = false',
      [email],
    );

    if (existing.rowCount > 0 && !resetOnly && !addRole) {
      throw new Error(
        `${email} already exists. Use --reset-password to set a new password, or --add-role to grant another role.`,
      );
    }
    if (existing.rowCount === 0 && (resetOnly || addRole)) {
      throw new Error(`${email} does not exist.`);
    }
    if (existing.rowCount === 0 && !fullName) {
      throw new Error('--name is required when creating a new account.');
    }

    await client.query('BEGIN');

    let adminId;

    if (existing.rowCount === 0) {
      console.log(`\nCreating ${email} (${fullName}) as ${roleName}.\n`);
      const password = await readPassword();
      const hash = await argon2.hash(password, ARGON2_OPTIONS);

      const inserted = await client.query(
        `INSERT INTO admins (email, password_hash, full_name)
         VALUES ($1, $2, $3) RETURNING id`,
        [email, hash, fullName],
      );
      adminId = inserted.rows[0].id;
    } else {
      adminId = existing.rows[0].id;

      if (resetOnly) {
        console.log(`\nResetting the password for ${email}.\n`);
        const password = await readPassword();
        const hash = await argon2.hash(password, ARGON2_OPTIONS);
        await client.query(
          'UPDATE admins SET password_hash = $1, updated_date = now() WHERE id = $2',
          [hash, adminId],
        );

        // A reset is a response to a lost or leaked password, so any session
        // still running on the old one has to end with it.
        const revoked = await client.query(
          `UPDATE refresh_tokens SET revoked_at = now()
           WHERE subject_id = $1 AND subject_type = 'admin' AND revoked_at IS NULL`,
          [adminId],
        );
        console.log(`  Revoked ${revoked.rowCount} active session(s).`);
      }
    }

    // Idempotent: re-running with the same role is a no-op rather than an error.
    //
    // The conflict target is spelled out rather than named. Since the staff
    // migration, uniqueness on (admin_id, role_code) is a PARTIAL unique index
    // covering only live rows — `ON CONFLICT ON CONSTRAINT <name>` cannot
    // reference an index, and the predicate has to be repeated here for
    // Postgres to infer the right one.
    if (!resetOnly || addRole) {
      const granted = await client.query(
        `INSERT INTO admin_roles (admin_id, role_code, site_code)
         VALUES ($1, $2, $3)
         ON CONFLICT (admin_id, role_code, site_code) WHERE revoked_at IS NULL DO NOTHING`,
        [adminId, ROLES[roleName], SITES[siteName]],
      );
      if (granted.rowCount > 0) {
        console.log(
          `  Granted role ${roleName} (${ROLES[roleName]}) on ${siteName} (${SITES[siteName]}).`,
        );
      } else {
        console.log(`  Role ${roleName} already held — nothing to do.`);
      }
    }

    await client.query('COMMIT');

    // revoked_at IS NULL — revoked assignments stay in the table for the audit
    // trail, and reporting them here would claim access that no longer exists.
    const roles = await client.query(
      `SELECT s.site_name, r.role_name FROM admin_roles ar
       JOIN role_masters r ON r.role_code = ar.role_code
       JOIN site_masters s ON s.site_code = ar.site_code
       WHERE ar.admin_id = $1 AND ar.revoked_at IS NULL
       ORDER BY ar.site_code, r.role_code`,
      [adminId],
    );

    console.log(`\n  ${email}`);
    console.log(`  id:    ${adminId}`);
    console.log(
      `  roles: ${roles.rows.map((r) => `${r.role_name} @ ${r.site_name}`).join(', ')}`,
    );
    console.log(
      `\nSign in at POST /admin/auth/login with siteCode ${SITES[siteName]} and roleCode ${ROLES[roleName]}.\n`,
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
});
