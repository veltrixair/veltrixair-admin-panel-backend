import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ArchitectIndustryMaster } from '../../master-data/entities/architect-industry-master.entity';

/**
 * A senior architect the desk can give a discovery session to.
 *
 * A personnel record rather than a public profile. Nobody outside picks an
 * architect any more — the visitor asks for an hour and the desk decides who
 * takes it — so what this holds is what the desk needs in order to decide and
 * to get hold of them: who they are, how to reach them, what they do, which
 * industries they know and how long they have been doing it.
 */
@Entity({ name: 'architects' })
export class Architect {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_architects_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  /**
   * Nullable in the column, required by the DTO.
   *
   * Four of the nine rows that predate this redesign were placeholders with a
   * title and no person. Rather than invent names for them, they stay visibly
   * unnamed until somebody fills them in; nothing created from now on can be.
   */
  @Column({ name: 'full_name', type: 'varchar', length: 150, nullable: true })
  fullName: string | null;

  /** e.g. "Senior Architect — Data Privacy". */
  @Column({ name: 'designation', type: 'varchar', length: 150 })
  designation: string;

  /*
   * Contact details for a named member of staff.
   *
   * Not `select: false`, unlike the attendee's: an attendee's number is a
   * stranger's personal data that the desk reads once, while these are the
   * working details of a colleague, needed on every screen that lists them.
   */
  @Column({ name: 'email', type: 'varchar', length: 190, nullable: true })
  email: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  /** Years in the profession, not years at the firm. */
  @Column({ name: 'experience_years', type: 'int', nullable: true })
  experienceYears: number | null;

  /**
   * The industries this architect knows.
   *
   * Many-to-many because seniority spans sectors: somebody who has delivered
   * for a bank and for a hospital group is one architect, not two, and forcing
   * a single choice would file them under whichever the desk thought of first.
   *
   * Its own master rather than the contact form's `industry_masters`: that
   * list asks a visitor what business they are in, this one says what an
   * architect does. See ArchitectIndustryMaster.
   */
  @ManyToMany(() => ArchitectIndustryMaster, { eager: false })
  @JoinTable({
    name: 'architect_industries',
    joinColumn: {
      name: 'architect_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'vtx_architect_industries_architect_id_fk',
    },
    inverseJoinColumn: {
      name: 'industry_code',
      referencedColumnName: 'industryCode',
      foreignKeyConstraintName: 'vtx_architect_industries_industry_code_fk',
    },
  })
  industries: ArchitectIndustryMaster[];

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
