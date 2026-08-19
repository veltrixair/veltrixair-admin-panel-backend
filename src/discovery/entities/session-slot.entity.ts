import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Architect } from './architect.entity';

export const SLOT_STATUSES = ['FREE', 'BOOKED', 'BLOCKED'] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

/** "10 / 25 / 10" — context, architecture, next steps. */
export const SESSION_MINUTES = 45;

/**
 * A materialised bookable slot.
 *
 * Slots are pre-generated rather than computed on the fly for two reasons: the
 * per-day density indicators need cheap counts, and claiming a slot becomes a
 * single conditional UPDATE, which is what makes double-booking impossible
 * without explicit locking.
 *
 * `startsAt` is an instant. The rule that produced it is expressed in KSA local
 * time, but nothing downstream needs to know that — every consumer converts to
 * whichever timezone it is rendering for.
 */
@Entity({ name: 'session_slots' })
@Unique('vtx_session_slots_architect_starts_at_unique', [
  'architectId',
  'startsAt',
])
export class SessionSlot {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_session_slots_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Index('idx_session_slots_architect_id')
  @Column({ name: 'architect_id', type: 'uuid' })
  architectId: string;

  @ManyToOne(() => Architect, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'architect_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_session_slots_architect_id_fk',
  })
  architect?: Architect;

  @Index('idx_session_slots_starts_at')
  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Index('idx_session_slots_status')
  @Column({ name: 'status', type: 'varchar', length: 10, default: 'FREE' })
  status: SlotStatus;

  /** Why a slot is BLOCKED, carried from the blackout that closed it. */
  @Column({
    name: 'blocked_reason',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  blockedReason: string | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
