import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the feature list say which brand each entry governs.
 *
 * `feature_masters` is one global list with no site column, so the NAME is the
 * only thing distinguishing a feature's brand. Unprefixed used to mean
 * "multi-brand", and that was true — CONTACT really did serve IT and privacy.
 * It stopped being true when privacy took its own contact module and crane took
 * its own careers, leaving four features that are IT-only but do not say so.
 *
 * Left alone: INSIGHTS, FILES and ADMINS. Those genuinely serve every brand, so
 * the absence of a prefix still carries meaning. After this the rule reads
 * cleanly — prefixed is one brand, bare is all of them.
 *
 * Names only. Every feature CODE is unchanged, so no row in role_permissions
 * moves, no badge changes, and no admin loses or gains anything.
 */
export class NameFeaturesByBrand1785884400000 implements MigrationInterface {
  name = 'NameFeaturesByBrand1785884400000';

  private readonly renames: [code: number, from: string, to: string][] = [
    [101, 'CONTACT', 'IT_CONTACT'],
    [102, 'CAREERS', 'IT_CAREERS'],
    [104, 'DISCOVERY', 'IT_DISCOVERY'],
    [107, 'APPLICATIONS', 'IT_APPLICATIONS'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [code, , to] of this.renames) {
      await queryRunner.query(
        `UPDATE "feature_masters" SET "feature_name" = $1 WHERE "feature_code" = $2`,
        [to, code],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [code, from] of this.renames) {
      await queryRunner.query(
        `UPDATE "feature_masters" SET "feature_name" = $1 WHERE "feature_code" = $2`,
        [from, code],
      );
    }
  }
}
