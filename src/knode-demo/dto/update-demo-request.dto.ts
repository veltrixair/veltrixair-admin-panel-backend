import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
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
