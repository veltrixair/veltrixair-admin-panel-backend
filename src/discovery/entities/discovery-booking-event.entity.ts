import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DiscoveryBooking } from './discovery-booking.entity';

export const DISCOVERY_BOOKING_EVENT_TYPES = [
  'CREATED',
  'ASSIGNED',
  'RESCHEDULED',
  'STATUS_CHANGED',
  'NOTE_ADDED',
  'CANCELLED_BY_ATTENDEE',
] as const;

export type DiscoveryBookingEventType =
  (typeof DISCOVERY_BOOKING_EVENT_TYPES)[number];

/**
 * Append-only timeline for a booking.
 *
 * A session now passes through more hands than it used to. The visitor asks
 * for an hour, somebody here decides who takes it, and only afterwards is
 * there an outcome to record — three separate acts by three different people,
 * where the booking row itself keeps only the latest answer to each.
 *
 * `ASSIGNED` carries both architects in its metadata rather than only the new
 * one: "who was on this before" is the question asked when a session goes
 * wrong, and the row cannot answer it once it has been overwritten.
 *
 * `CANCELLED_BY_ATTENDEE` is distinct from a `STATUS_CHANGED` to CANCELLED.
 * Both leave the booking cancelled, and only one of them is this desk's doing.
 *
 * `RESCHEDULED` keeps the hour the attendee originally asked for. Once the row
 * is updated the old time exists nowhere else, and "we moved them" is a
 * different fact from "they asked for this time" when a session is disputed.
 */
@Entity({ name: 'discovery_booking_events' })
export class DiscoveryBookingEvent {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_discovery_booking_events_id_pk',
  })
  id: string;

  @Index('idx_discovery_booking_events_booking_id')
  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @ManyToOne(() => DiscoveryBooking, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'booking_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_discovery_booking_events_booking_id_fk',
  })
  booking?: DiscoveryBooking;

  @Column({ name: 'event_type', type: 'varchar', length: 30 })
  eventType: DiscoveryBookingEventType;

  /** The signed-in admin's email, or null for events the system raised. */
  @Column({ name: 'actor', type: 'varchar', length: 150, nullable: true })
  actor: string | null;

  @Column({ name: 'note', type: 'varchar', length: 2000, nullable: true })
  note: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
