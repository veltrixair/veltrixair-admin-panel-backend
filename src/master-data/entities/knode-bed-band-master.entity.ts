import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Inpatient beds, as a band. Nobody filling in a web form knows their exact count, and a band is what sizing an install actually needs.
 *
 * Seeded from the list the kNODE website already ships in its own bundle, so
 * the form and the database agree by construction. The site fetches these from
 * /knode/demo-options rather than keeping its own copy — two hardcoded lists
 * is how the crane dropdowns drifted.
 */
@Entity({ name: 'knode_bed_band_masters' })
@Unique('vtx_knode_bed_band_masters_bed_band_code_unique', ['bedBandCode'])
export class KnodeBedBandMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_knode_bed_band_masters_id_pk',
  })
  id: string;

  /** kNODE ships on the IT unit, but the column keeps that a fact about the
   *  data rather than an assumption baked into every query. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'bed_band_code', type: 'int' })
  bedBandCode: number;

  /** Exactly the words the website prints, so an admin reading a lead sees
   *  what the visitor saw. */
  @Column({ name: 'bed_band_label', type: 'varchar', length: 120 })
  bedBandLabel: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
