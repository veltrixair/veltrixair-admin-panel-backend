import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { KNODE_LEAD_STATUSES } from '../entities/knode-lead.entity';
import type { KnodeLeadStatus } from '../entities/knode-lead.entity';

export class UpdateKnodeLeadStatusDto {
  /**
   * Checked here against both vocabularies, and again in the service against
   * the one that belongs to this lead's type. The pipe cannot do the second
   * check — it has the request but not the row.
   */
  @IsIn(KNODE_LEAD_STATUSES)
  status: KnodeLeadStatus;

  /** Optional reason, kept on the timeline entry rather than the lead. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AssignKnodeLeadDto {
  /** An email, or null to hand it back to the pool. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  assignedTo?: string | null;
}

export class AddKnodeLeadNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note: string;
}
