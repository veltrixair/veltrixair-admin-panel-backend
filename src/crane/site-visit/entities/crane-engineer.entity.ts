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
import { CraneServiceLineMaster } from '../../masters/entities/crane-service-line-master.entity';

/**
 * An engineer the desk can send to a site.
 *
 * A roster of its own rather than the staff register, because these are not
 * the same people. The "assigned to" box on every other crane desk suggests
 * colleagues who hold a login here, which is right for a quote or an
 * application — somebody who has to open the panel and act on it. A field
 * engineer attends a site and may never sign in at all, so that list offers
 * nobody useful and the coordinator ends up typing an address by hand. That is
 * how `assigned_engineer` came to hold one value, typed, with no way to tell
 * whether it was spelled the same as last time.
 *
 * Deliberately narrow: who they are, how to reach them, and what they do.
 * Visa status and base city were both considered and left out — the request
 * was a roster to pick from, and a form with fields nobody fills in is worse
 * than a short one.
 */
@Entity({ name: 'crane_engineers' })
export class CraneEngineer {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_engineers_id_pk',
  })
  id: string;

  /** Always 102 here — the crane unit. Kept for the usual brand scoping. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  /** e.g. "Senior Lifting Engineer". */
  @Column({ name: 'designation', type: 'varchar', length: 150 })
  designation: string;

  /**
   * The working address, and the one unique thing about a colleague.
   *
   * Also what every crane desk already stores in its assignment column, so a
   * visit assigned through the roster still reads the same way as the one
   * assigned before it existed.
   */
  @Column({ name: 'email', type: 'varchar', length: 190 })
  email: string;

  @Column({ name: 'phone', type: 'varchar', length: 30 })
  phone: string;

  /** Years in the profession, not years at the firm. */
  @Column({ name: 'experience_years', type: 'int' })
  experienceYears: number;

  /**
   * The services this engineer covers.
   *
   * Many-to-many: commissioning and load testing are routinely the same
   * person, and a single choice would file them under whichever the desk
   * thought of first. Shares the service-line master the public form already
   * asks the customer to choose from, so "what was requested" and "who can do
   * it" are expressed in one vocabulary.
   */
  @ManyToMany(() => CraneServiceLineMaster, { eager: false })
  @JoinTable({
    name: 'crane_engineer_service_lines',
    joinColumn: {
      name: 'engineer_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName:
        'vtx_crane_engineer_service_lines_engineer_id_fk',
    },
    inverseJoinColumn: {
      name: 'service_line_code',
      referencedColumnName: 'serviceLineCode',
      foreignKeyConstraintName:
        'vtx_crane_engineer_service_lines_service_line_code_fk',
    },
  })
  serviceLines: CraneServiceLineMaster[];

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
