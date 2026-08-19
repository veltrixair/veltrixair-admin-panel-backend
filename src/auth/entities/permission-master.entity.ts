import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** The verbs — VIEW, CREATE, UPDATE, DELETE. */
@Entity({ name: 'permission_masters' })
@Unique('vtx_permission_masters_permission_code_unique', ['permissionCode'])
export class PermissionMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_permission_masters_id_pk',
  })
  id: string;

  @Column({ name: 'permission_code', type: 'int' })
  permissionCode: number;

  @Column({ name: 'permission_name', type: 'varchar', length: 50 })
  permissionName: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
