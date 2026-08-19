import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export const SUBJECT_TYPES = ['admin', 'client'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

/**
 * A refresh session.
 *
 * Only the HASH of the token is stored — a leaked database should not hand over
 * working sessions any more than it hands over passwords.
 *
 * `subjectType` exists although only admins are issued tokens today. A client
 * portal would add `'client'` here rather than needing a parallel table, which
 * is the one decision that keeps that future cheap.
 *
 * `replacedBy` implements rotation: refreshing revokes the old token and points
 * it at its successor, so presenting a revoked token is detectable reuse rather
 * than a silent replay.
 */
@Entity({ name: 'refresh_tokens' })
@Unique('vtx_refresh_tokens_token_hash_unique', ['tokenHash'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_refresh_tokens_id_pk',
  })
  id: string;

  @Index('idx_refresh_tokens_subject_id')
  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId: string;

  @Column({ name: 'subject_type', type: 'varchar', length: 10 })
  subjectType: SubjectType;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  /** Groups a rotated chain so the whole family can be revoked at once. */
  @Index('idx_refresh_tokens_family_id')
  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Column({ name: 'replaced_by', type: 'uuid', nullable: true })
  replacedBy: string | null;

  /**
   * The scope this session was opened with, chosen at sign-in.
   *
   * Storing it means a refresh re-issues the *same* scope and can never be
   * used to widen access or move to another brand. Nullable only because
   * sessions created before multi-site existed have no role recorded; those
   * are refused on refresh rather than being guessed at.
   */
  @Column({ name: 'site_code', type: 'int', nullable: true })
  siteCode: number | null;

  @Column({ name: 'role_code', type: 'int', nullable: true })
  roleCode: number | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'ip_hash', type: 'varchar', length: 64, nullable: true })
  ipHash: string | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
