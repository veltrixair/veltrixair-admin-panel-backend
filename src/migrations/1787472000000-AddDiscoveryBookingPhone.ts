import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records the phone number the booking pop-up already asks for.
 *
 * The form keeps Confirm disabled until the number validates for its chosen
 * country, so every visitor supplies one — and the API was dropping it on the
 * floor, because the DTO never declared the field. Worth having beyond the
 * email: a discovery session is a time two people both have to make, and the
 * fastest way to say an architect is running late is not a message in an
 * inbox.
 *
 * Nullable, not NOT NULL. Required of new bookings by the DTO, but the seven
 * rows that predate this column have no number and never will; a placeholder
 * would read as a phone number nobody can call.
 */
export class AddDiscoveryBookingPhone1787472000000
  implements MigrationInterface
{
  name = 'AddDiscoveryBookingPhone1787472000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings" ADD COLUMN "phone" varchar(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "discovery_bookings" DROP COLUMN IF EXISTS "phone"
    `);
  }
}
