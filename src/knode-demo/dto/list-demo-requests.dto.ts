import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  KNODE_DEMO_INTENTS,
  KNODE_DEMO_STATUSES,
} from '../entities/knode-demo-request.entity';
import type {
  KnodeDemoIntent,
  KnodeDemoStatus,
} from '../entities/knode-demo-request.entity';

export class ListDemoRequestsDto extends PaginationQueryDto {
  /**
   * Which of the two lists is on screen. The demo pipeline and the waiting
   * list are different jobs, so the screen shows one at a time.
   */
  @IsOptional()
  @IsIn(KNODE_DEMO_INTENTS)
  intent?: KnodeDemoIntent;

  /** Only meaningful with intent=DEMO — a notify row holds no status. */
  @IsOptional()
  @IsIn(KNODE_DEMO_STATUSES)
  status?: KnodeDemoStatus;

  /**
   * The question the waiting list exists to answer: who is waiting for
   * Pharmacy. Joins through knode_demo_request_modules.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  moduleCode?: number;

  /** Matches facility, contact person, city or reference, case-insensitive. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Notify rows nobody has told yet. Ignored for DEMO. */
  @IsOptional()
  @IsIn(['true', 'false'])
  waiting?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  unassigned?: string;
}
