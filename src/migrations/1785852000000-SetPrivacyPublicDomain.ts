import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The privacy advisory site's public domain.
 *
 * Site 103 was seeded with its dashboard domain but no public one, because the
 * marketing site had not been confirmed. It is dataprivacy.veltrixair.com —
 * distinct from dp.veltrixair.com, which is where the admin dashboard is
 * served.
 *
 * The distinction matters to how a request finds its brand: an anonymous
 * contact form carries no token, so the site is resolved from the request
 * origin against `public_domain`. A signed-in dashboard resolves it from the
 * token's site claim instead, and `admin_domain` is what that claim is checked
 * against.
 */
export class SetPrivacyPublicDomain1785852000000 implements MigrationInterface {
  name = 'SetPrivacyPublicDomain1785852000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "site_masters"
      SET "public_domain" = 'dataprivacy.veltrixair.com', "updated_date" = now()
      WHERE "site_code" = 103
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "site_masters"
      SET "public_domain" = NULL, "updated_date" = now()
      WHERE "site_code" = 103
    `);
  }
}
