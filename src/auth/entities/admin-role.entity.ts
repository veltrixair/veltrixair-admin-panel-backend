import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SiteMaster } from '../../master-data/entities/site-master.entity';
import { Admin } from './admin.entity';
import { RoleMaster } from './role-master.entity';

/**
 * Which roles an admin holds. An admin may hold more than one.
 *
 * Revocation sets `revokedAt` rather than deleting the row, so the history of
 * who granted what — and who took it away — survives. Uniqueness is therefore
 * a partial index over live rows only (see the CreateStaffModule migration);
 * it cannot be expressed with @Unique here, which would span revoked rows too.
 *
 * Every read of this table must filter `revokedAt IS NULL`.
 */
@Entity({ name: 'admin_roles' })
export class AdminRole {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_admin_roles_id_pk',
  })
  id: string;

  @Index('idx_admin_roles_admin_id')
  @Column({ name: 'admin_id', type: 'uuid' })
  adminId: string;

  @ManyToOne(() => Admin, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'admin_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_admin_roles_admin_id_fk',
  })
  admin?: Admin;

  @Column({ name: 'role_code', type: 'int' })
  roleCode: number;

  @ManyToOne(() => RoleMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'role_code',
    referencedColumnName: 'roleCode',
    foreignKeyConstraintName: 'vtx_admin_roles_role_code_fk',
  })
  role?: RoleMaster;

  /**
   * Which business this badge is for. The column that turns a role assignment
   * from a pair into a triple, and the whole basis of cross-brand isolation.
   */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @ManyToOne(() => SiteMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'site_code',
    referencedColumnName: 'siteCode',
    foreignKeyConstraintName: 'vtx_admin_roles_site_code_fk',
  })
  site?: SiteMaster;

  @Column({ name: 'assigned_by', type: 'uuid', nullable: true })
  assignedBy: string | null;

  @CreateDateColumn({ name: 'assigned_date', type: 'timestamptz' })
  assignedDate: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy: string | null;
}
