import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Its own list rather than the IT one: crane hires from trades, so Diploma/ITI and trade certification are real answers here and absent there. */
@Entity({ name: 'crane_career_qualification_masters' })
@Unique('vtx_crane_career_qualification_masters_code_uq', ['qualificationCode'])
export class CraneCareerQualificationMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_career_qualification_masters_id_pk',
  })
  id: string;

  @Column({ name: 'site_code', type: 'int', default: 102 })
  siteCode: number;

  @Column({ name: 'qualification_code', type: 'int' })
  qualificationCode: number;

  @Column({ name: 'qualification_name', type: 'varchar', length: 150 })
  qualificationName: string;

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
