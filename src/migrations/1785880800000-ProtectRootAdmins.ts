import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marks the accounts that unit admins may not touch.
 *
 * Once each unit has its own super admin, the existing "never leave a unit
 * without a super admin" guard stops protecting the root account: on site 101
 * the IT admin and the root account hold identical badges, so nothing says one
 * outranks the other, and the IT admin can revoke the root's IT badge or reset
 * its password. That is the correct reading of the rules as written — it is the
 * rules that were missing a rank.
 *
 * `is_protected` is that rank, and deliberately the only one. A protected
 * account may be modified only by another protected account; everything else
 * about a unit admin's authority over their own unit is unchanged.
 *
 * Seeded by SHAPE rather than by email: whoever holds a live SUPER_ADMIN badge
 * on every active brand today is the root, regardless of what it is called.
 * That keeps the migration true in any environment rather than only the one it
 * was written against.
 */
export class ProtectRootAdmins1785880800000 implements MigrationInterface {
  name = 'ProtectRootAdmins1785880800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admins"
        ADD COLUMN "is_protected" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "admins"."is_protected" IS
        'Only another protected account may change this one. Guards the root against unit admins.'
    `);

    await queryRunner.query(`
      UPDATE "admins" a
         SET "is_protected" = true
       WHERE a."is_deleted" = false
         AND NOT EXISTS (
           SELECT 1
             FROM "site_masters" s
            WHERE s."is_active" = true
              AND s."is_deleted" = false
              AND NOT EXISTS (
                SELECT 1
                  FROM "admin_roles" ar
                 WHERE ar."admin_id" = a."id"
                   AND ar."site_code" = s."site_code"
                   AND ar."role_code" = 101
                   AND ar."revoked_at" IS NULL
              )
         )
    `);

    // Printed because the seed is by shape, not by name: whoever comes out
    // protected should be recognisable to whoever runs this.
    const rows = (await queryRunner.query(
      `SELECT "email" FROM "admins" WHERE "is_protected" = true ORDER BY "email"`,
    )) as { email: string }[];

    console.log(
      rows.length > 0
        ? `  protected: ${rows.map((row) => row.email).join(', ')}`
        : '  WARNING: no account holds SUPER_ADMIN on every brand — nothing was protected.',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admins" DROP COLUMN IF EXISTS "is_protected"`,
    );
  }
}
