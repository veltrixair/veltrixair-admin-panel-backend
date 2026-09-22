import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { KNODE_DEMO_STATUSES } from '../entities/knode-demo-request.entity';
import type { KnodeDemoStatus } from '../entities/knode-demo-request.entity';

export class UpdateDemoRequestStatusDto {
  /**
   * Refused on a NOTIFY row by the service. A waiting list has no stages, and
   * pretending otherwise would invent work nobody does.
   */
  @IsIn(KNODE_DEMO_STATUSES)
  status: KnodeDemoStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AssignDemoRequestDto {
  /** An email, or null to hand it back to the pool. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  assignedTo?: string | null;
}

export class AddDemoRequestNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note: string;
}

/**
 * Mark a waiting list as told.
 *
 * Deliberately bulk and keyed by module rather than by row. When Pharmacy
 * ships you do not walk a pipeline — you email everybody who asked about
 * Pharmacy, in one action, and record that you did.
 */
export class MarkNotifiedDto {
  @Type(() => Number)
  @IsInt()
  moduleCode: number;

  /**
   * Optional narrowing, for the case where only some were actually emailed.
   * Omit it and every still-waiting request for that module is stamped.
   */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  requestIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * Set or clear the notified stamp on one request.
 *
 * The bulk route above is the workflow — a module ships, and the queue it
 * collected is cleared in one action. This is the correction beside it: one
 * row, both directions, for the cases a queue cannot express. Somebody was
 * emailed individually; somebody was marked by mistake; an address bounced and
 * it has to go back.
 *
 * It takes no module code, because a request can name several and none of them
 * is the reason for a manual change. The event records the direction instead.
 */
export class SetNotifiedDto {
  @IsBoolean()
  notified: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
