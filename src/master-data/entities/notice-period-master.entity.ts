import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** How soon a candidate can start. Recruiters filter on this constantly, so it is a coded value rather than free text. */
@Entity({ name: 'notice_period_masters' })
@Unique('vtx_notice_period_masters_notice_period_code_unique', [
  'noticePeriodCode',
])
export class NoticePeriodMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_notice_period_masters_id_pk',
  })
  id: string;

  @Column({ name: 'notice_period_code', type: 'int' })
  noticePeriodCode: number;

  @Column({ name: 'notice_period_name', type: 'varchar', length: 100 })
  noticePeriodName: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
  })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
