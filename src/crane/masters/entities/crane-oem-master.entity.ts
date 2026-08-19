import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Original manufacturer. Determines parts availability and who to approach for drawings. */
@Entity({ name: 'crane_oem_masters' })
@Unique('vtx_crane_oem_masters_oem_code_unique', ['oemCode'])
export class CraneOemMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_oem_masters_id_pk',
  })
  id: string;

  @Column({ name: 'oem_code', type: 'int' })
  oemCode: number;

  @Column({ name: 'oem_name', type: 'varchar', length: 120 })
  oemName: string;

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
