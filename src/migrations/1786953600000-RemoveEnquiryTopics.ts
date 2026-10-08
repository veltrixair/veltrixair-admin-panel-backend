import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes enquiry topics entirely.
 *
 * The contact form on the website never asked for a topic, so every submission
 * either had to invent one or be refused. Rather than add a control nobody
 * wanted, the concept goes.
 *
 * WHAT THIS COSTS, recorded here because it is not obvious from the schema:
 * the topic chose the inbox. `enquiry_topic_masters.route_email` sent Voice AI
 * enquiries to voiceai@ and privacy enquiries to privacy@, while the rest went
 * to contact@. With topics gone, routing is country → office → the office's own
 * inbox, so everything from a country reaches the office that owns it and
 * sorting by subject becomes a job for whoever reads the mail.
 *
 * Existing rows lose which topic they arrived under. There were twelve, split
 * ten New Engagement / one Voice AI Demo / one Privacy Advisory, and the column
 * is dropped rather than archived — keeping a code whose lookup table no longer
 * exists would be a number nobody could resolve.
 */
export class RemoveEnquiryTopics1786953600000 implements MigrationInterface {
  name = 'RemoveEnquiryTopics1786953600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contact_enquiries"
        DROP CONSTRAINT IF EXISTS "vtx_contact_enquiries_topic_code_fk"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contact_enquiries_topic_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contact_enquiries" DROP COLUMN IF EXISTS "topic_code"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "enquiry_topic_masters"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "enquiry_topic_masters" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_code"     int NOT NULL,
        "topic_code"    int NOT NULL,
        "topic_name"    varchar(100) NOT NULL,
        "route_email"   varchar(255) NOT NULL,
        "display_order" int NOT NULL DEFAULT 0,
        "is_active"     boolean NOT NULL DEFAULT true,
        "is_deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at"    timestamptz,
        "created_date"  timestamptz NOT NULL DEFAULT now(),
        "updated_date"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vtx_enquiry_topic_masters_id_pk" PRIMARY KEY ("id"),
        CONSTRAINT "vtx_enquiry_topic_masters_topic_code_unique"
          UNIQUE ("topic_code")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "enquiry_topic_masters"
        ("site_code", "topic_code", "topic_name", "route_email", "display_order")
      VALUES
        (101, 101, 'New Engagement',   'contact@veltrixair.com', 1),
        (101, 102, 'RFP / RFI',        'contact@veltrixair.com', 2),
        (101, 103, 'Partnership',      'contact@veltrixair.com', 3),
        (101, 104, 'Voice AI Demo',    'voiceai@veltrixair.com', 4),
        (101, 105, 'Privacy Advisory', 'privacy@veltrixair.com', 5),
        (101, 106, 'Managed Services', 'contact@veltrixair.com', 6),
        (101, 107, 'Other',            'contact@veltrixair.com', 7)
    `);

    /*
     * Every existing enquiry comes back as "Other".
     *
     * The real answer was dropped with the column and cannot be recovered — a
     * reversal restores the mechanism, not the history. "Other" is the honest
     * placeholder: it says the topic is unknown rather than asserting one.
     */
    await queryRunner.query(
      `ALTER TABLE "contact_enquiries" ADD COLUMN "topic_code" int`,
    );
    await queryRunner.query(
      `UPDATE "contact_enquiries" SET "topic_code" = 107`,
    );
    await queryRunner.query(`
      ALTER TABLE "contact_enquiries" ALTER COLUMN "topic_code" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_contact_enquiries_topic_code"
        ON "contact_enquiries" ("topic_code")
    `);
    await queryRunner.query(`
      ALTER TABLE "contact_enquiries"
        ADD CONSTRAINT "vtx_contact_enquiries_topic_code_fk"
          FOREIGN KEY ("topic_code")
          REFERENCES "enquiry_topic_masters" ("topic_code")
          ON DELETE RESTRICT
    `);
  }
}
