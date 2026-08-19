import * as argon2 from 'argon2';

/**
 * OWASP's recommended argon2id parameters (19 MiB, 2 passes, 1 lane).
 *
 * These are baked into the hash string itself, so raising them later does not
 * invalidate existing passwords — an old hash still verifies against its own
 * recorded cost, and gets rewritten at the next successful login.
 *
 * Kept in its own file because two services hash passwords: AuthService when
 * someone changes their own, and StaffService when an admin creates an account
 * or resets someone else's. Neither should have to import the other for a
 * constant.
 *
 * scripts/create-admin.js carries its own copy of these values, since it runs
 * outside Nest against raw SQL. Change them here and there together.
 */
export const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
