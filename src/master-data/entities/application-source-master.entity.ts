import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** "How did you hear about us?" — tells you which channels actually produce candidates. */
@Entity({ name: 'application_source_masters' })
@Unique('vtx_application_source_masters_source_code_unique', ['sourceCode'])
export class ApplicationSourceMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_application_source_masters_id_pk',
  })
  id: string;

  @Column({ name: 'source_code', type: 'int' })
  sourceCode: number;

  @Column({ name: 'source_name', type: 'varchar', length: 100 })
  sourceName: string;

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
