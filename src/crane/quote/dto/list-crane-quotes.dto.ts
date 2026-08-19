import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ToBoolean } from '../../../common/transformers/to-boolean.transformer';
import { QUOTE_STATUSES } from '../entities/crane-quote-request.entity';
import type { QuoteStatus } from '../entities/crane-quote-request.entity';

const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;

export class ListCraneQuotesDto extends PaginationQueryDto {
  /** Matches company, contact name, email or reference number. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(QUOTE_STATUSES, {
    message: `status must be one of: ${QUOTE_STATUSES.join(', ')}`,
  })
  status?: QuoteStatus;

  @IsOptional()
  @IsIn(PRIORITIES, { message: 'priority must be P1, P2, P3 or P4' })
  priority?: 'P1' | 'P2' | 'P3' | 'P4';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceLineCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  siteCityCode?: number;

  /** Still untouched past its triage promise — the list that needs chasing. */
  @IsOptional()
  @ToBoolean()
  overdue?: boolean;
}
