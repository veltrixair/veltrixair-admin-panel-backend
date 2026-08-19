import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * One cell of the role matrix: this role may perform this action on this area.
 *
 * Deliberately not a nested structure — a flat triple is what the guard checks
 * on every request, and a unique index over all three makes that a single
 * indexed lookup.
 */
@Entity({ name: 'role_permissions' })
@Unique('vtx_role_permissions_unique', [
  'roleCode',
  'featureCode',
  'permissionCode',
])
export class RolePermission {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_role_permissions_id_pk',
  })
  id: string;

  @Index('idx_role_permissions_role_code')
  @Column({ name: 'role_code', type: 'int' })
  roleCode: number;

  @Column({ name: 'feature_code', type: 'int' })
  featureCode: number;

  @Column({ name: 'permission_code', type: 'int' })
  permissionCode: number;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
