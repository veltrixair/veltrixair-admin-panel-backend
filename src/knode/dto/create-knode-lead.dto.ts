import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { KNODE_LEAD_TYPES } from '../entities/knode-lead.entity';
import type { KnodeLeadType } from '../entities/knode-lead.entity';

/**
 * One lead as the deck saves it.
 *
 * The deck writes its records in lower snake case (`meeting_scheduled`), which
 * is what its own localStorage queue already contains. Rather than ask for a
 * change to a tool that is already in reps' hands, the type is upper-cased
 * here — the wire format stays what the deck emits, the stored value stays
 * what the rest of this codebase uses.
 */
export class CreateKnodeLeadDto {
  /**
   * The deck's own id for this record. Any stable string it can regenerate for
   * the same lead — a UUID, or its save timestamp. It is what makes re-sending
   * a queue safe, so it is required rather than optional.
   */
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  clientKey: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(KNODE_LEAD_TYPES)
  type: KnodeLeadType;

  @IsString()
  @MaxLength(200)
  hospital: string;

  @IsString()
  @MaxLength(150)
  person: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  designation?: string;

  @IsString()
  @MaxLength(32)
  whatsapp: string;

  /** Optional in the room, so optional here. */
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  /** Required in practice for a meeting; the service enforces that pairing. */
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'time must be HH:mm on a 24-hour clock',
  })
  time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /**
   * When the rep pressed save. Sent by the deck rather than inferred, because
   * a queued lead reaches the server long after the conversation happened.
   */
  @IsISO8601()
  savedAt: string;
}
