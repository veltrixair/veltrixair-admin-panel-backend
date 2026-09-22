import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  KNODE_LEAD_STATUSES,
  KNODE_LEAD_TYPES,
} from '../entities/knode-lead.entity';
import type {
  KnodeLeadStatus,
  KnodeLeadType,
} from '../entities/knode-lead.entity';

export class ListKnodeLeadsDto extends PaginationQueryDto {
  /**
   * Which of the two sub-sections is on screen. Omitting it returns both,
   * which is what the export uses.
   */
  @IsOptional()
  @IsIn(KNODE_LEAD_TYPES)
  type?: KnodeLeadType;

  /**
   * Validated against the union of both vocabularies, because the caller may
   * not have sent a type. Asking for a client status while filtering to
   * meetings is not an error — it simply matches nothing.
   */
  @IsOptional()
  @IsIn(KNODE_LEAD_STATUSES)
  status?: KnodeLeadStatus;

  /** Matches hospital, contact person or reference, case-insensitive. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /**
   * Meetings booked between today and seven days out that are still going to
   * happen — the "Upcoming this week" tile. Meaningless for confirmed clients,
   * which have no meeting date, and ignored for them.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  upcoming?: string;

  /** Leads nobody has picked up yet. */
  @IsOptional()
  @IsIn(['true', 'false'])
  unassigned?: string;
}
