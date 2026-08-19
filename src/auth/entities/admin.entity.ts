import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A staff account.
 *
 * `passwordHash` is `select: false` — a hash is not secret in the way a
 * password is, but it is the input to an offline cracking attempt, so it should
 * never arrive in a response because someone forgot to exclude it.
 */
@Entity({ name: 'admins' })
@Unique('vtx_admins_email_unique', ['email'])
export class Admin {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_admins_id_pk',
  })
  id: string;

  @Index('idx_admins_email')
  @Column({ name: 'email', type: 'varchar', length: 255 })
  email: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Only another protected account may change this one.
   *
   * The root account holds a badge on every brand, so it appears on every unit
   * admin's staff list and — without this — is theirs to revoke, deactivate or
   * reset like anyone else on their dashboard. Their authority over their own
   * unit is otherwise untouched; this is the single exception to it.
   */
  @Column({ name: 'is_protected', type: 'boolean', default: false })
  isProtected: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /** The admin who created this account; null for the bootstrap account. */
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
