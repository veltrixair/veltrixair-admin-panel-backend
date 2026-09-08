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
  /**
   * The person this login belongs to.
   *
   * NULL only for service accounts — admin@, it.admin@, crane.admin@ and
   * privacy.admin@ are credentials rather than people and have no HR file.
   * Everyone else is an employee first and an account holder second.
   */
  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  /**
   * A display picture the account holder chose for themselves.
   *
   * Not the PHOTO slot in `employee_documents` — that one is a passport-size
   * photograph kept as part of the personnel file, verified by HR and subject
   * to the document workflow. Replacing an avatar should not be an edit to
   * somebody's identity documents.
   *
   * On the account rather than the employee so the four service super-admins,
   * which have no HR file, can have one too.
   */
  @Column({ name: 'avatar_file_id', type: 'uuid', nullable: true })
  avatarFileId: string | null;

  @Column({ name: 'email', type: 'varchar', length: 255 })
  email: string;

  /**
   * Null until the account is invited.
   *
   * An account is created first and activated second, so between those two
   * moments it exists with no way to sign in. A null here means exactly that —
   * created, not yet invited — and login treats it as a plain refusal rather
   * than handing argon2 an undefined to choke on.
   */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
  })
  passwordHash: string | null;

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

  /** When the invitation went out. Null means it never has. */
  @Column({ name: 'invited_at', type: 'timestamptz', nullable: true })
  invitedAt: Date | null;

  /**
   * Set whenever a password was chosen by somebody else — at invitation, and
   * again after an admin resets one.
   *
   * Enforced in PermissionsGuard rather than the sign-in response, so a
   * temporary password cannot simply be used against the API directly while
   * the browser is told to show a change-password screen.
   */
  @Column({ name: 'must_change_password', type: 'boolean', default: false })
  mustChangePassword: boolean;

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
