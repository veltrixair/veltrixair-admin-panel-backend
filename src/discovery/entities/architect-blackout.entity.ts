import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Architect } from './architect.entity';

export const BLACKOUT_REASONS = ['LEAVE', 'HOLIDAY', 'COMMITMENT'] as const;
export type BlackoutReason = (typeof BLACKOUT_REASONS)[number];

/**
 * A period an architect is unavailable — leave, a public holiday, or an
 * existing client commitment.
 *
 * `architectId` is nullable: a null value applies the blackout to everyone,
 * which is how a firm-wide holiday is expressed while there is no dedicated
 * holiday calendar.
 */
@Entity({ name: 'architect_blackouts' })
export class ArchitectBlackout {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_architect_blackouts_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Index('idx_architect_blackouts_architect_id')
  @Column({ name: 'architect_id', type: 'uuid', nullable: true })
  architectId: string | null;

  @ManyToOne(() => Architect, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({
    name: 'architect_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_architect_blackouts_architect_id_fk',
  })
  architect?: Architect;

  @Index('idx_architect_blackouts_range')
  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Column({ name: 'reason', type: 'varchar', length: 20 })
  reason: BlackoutReason;

  @Column({ name: 'note', type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
