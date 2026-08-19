import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Architect } from './architect.entity';

/**
 * An architect's recurring weekly availability.
 *
 * The site states sessions run Monday–Thursday, 09:00–18:00 KSA — which is the
 * intersection of all three offices' working weeks (Riyadh Sun–Thu, Dubai and
 * Bangalore Mon–Fri). Within that window each architect declares the days they
 * actually offer, so a weekly off day is simply an absent row.
 *
 * `effectiveFrom`/`effectiveTo` mean a pattern change closes the old rule and
 * opens a new one rather than rewriting history.
 */
@Entity({ name: 'architect_availability_rules' })
export class ArchitectAvailabilityRule {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_architect_availability_rules_id_pk',
  })
  id: string;

  /** Which of the three brands this row belongs to. */
  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Index('idx_architect_availability_rules_architect_id')
  @Column({ name: 'architect_id', type: 'uuid' })
  architectId: string;

  @ManyToOne(() => Architect, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'architect_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName:
      'vtx_architect_availability_rules_architect_id_fk',
  })
  architect?: Architect;

  /** JS day number — 0 Sunday … 6 Saturday. */
  @Column({ name: 'weekday', type: 'int' })
  weekday: number;

  /** Local start hour in `timezone`, 24h. */
  @Column({ name: 'start_hour', type: 'int' })
  startHour: number;

  @Column({ name: 'end_hour', type: 'int' })
  endHour: number;

  /** The timezone the hours are expressed in — Asia/Riyadh for the stated rule. */
  @Column({ name: 'timezone', type: 'varchar', length: 64 })
  timezone: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
