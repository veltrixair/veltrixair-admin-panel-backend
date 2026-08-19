import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DiscoveryPracticeMaster } from '../../master-data/entities/discovery-practice-master.entity';
import { OfficeMaster } from '../../master-data/entities/office-master.entity';

/**
 * The senior architect a visitor meets for a given practice.
 *
 * One architect per practice today, but modelled as many-to-one so a practice
 * can gain a second architect without a migration — the slot generator already
 * works per architect.
 */
@Entity({ name: 'architects' })
@Unique('vtx_architects_slug_unique', ['slug'])
export class Architect {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_architects_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'slug', type: 'varchar', length: 120 })
  slug: string;

  /** Null until the real practitioner is named. */
  @Column({ name: 'full_name', type: 'varchar', length: 150, nullable: true })
  fullName: string | null;

  /** Shown while `full_name` is unset, e.g. "Senior Architect". */
  @Column({ name: 'display_title', type: 'varchar', length: 150 })
  displayTitle: string;

  /** "Partner or principal with 10–18 years of multi-jurisdictional delivery." */
  @Column({ name: 'credentials', type: 'varchar', length: 500, nullable: true })
  credentials: string | null;

  /**
   * The practices this architect covers.
   *
   * Many-to-many because the disciplines overlap — Cybersecurity & SOC and
   * Data Privacy in particular — so one practitioner may serve both, while a
   * practice may also have several architects.
   */
  @ManyToMany(() => DiscoveryPracticeMaster, { eager: false })
  @JoinTable({
    name: 'architect_practices',
    joinColumn: {
      name: 'architect_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'vtx_architect_practices_architect_id_fk',
    },
    inverseJoinColumn: {
      name: 'practice_code',
      referencedColumnName: 'practiceCode',
      foreignKeyConstraintName: 'vtx_architect_practices_practice_code_fk',
    },
  })
  practices: DiscoveryPracticeMaster[];

  @Column({ name: 'office_code', type: 'int' })
  officeCode: number;

  @ManyToOne(() => OfficeMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'office_code',
    referencedColumnName: 'officeCode',
    foreignKeyConstraintName: 'vtx_architects_office_code_fk',
  })
  office?: OfficeMaster;

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
