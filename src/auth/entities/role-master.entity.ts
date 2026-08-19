import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A named bundle of permissions.
 *
 * Kept in `auth` rather than `master-data` even though it ends in `_masters`:
 * master-data serves dropdowns and filter chips to the frontend and is @Global,
 * whereas this is authorization vocabulary nothing outside auth should read.
 */
@Entity({ name: 'role_masters' })
@Unique('vtx_role_masters_role_code_unique', ['roleCode'])
export class RoleMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_role_masters_id_pk',
  })
  id: string;

  @Column({ name: 'role_code', type: 'int' })
  roleCode: number;

  @Column({ name: 'role_name', type: 'varchar', length: 50 })
  roleName: string;

  @Column({ name: 'description', type: 'varchar', length: 300, nullable: true })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
