import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { QUOTE_STATUSES } from '../entities/crane-quote-request.entity';
import type { QuoteStatus } from '../entities/crane-quote-request.entity';

/** WITHDRAWN is absent — only the customer withdraws their own request. */
const ADMIN_SETTABLE = QUOTE_STATUSES.filter((s) => s !== 'WITHDRAWN');

export class UpdateCraneQuoteStatusDto {
  @IsIn(ADMIN_SETTABLE, {
    message: `status must be one of: ${ADMIN_SETTABLE.join(', ')}`,
  })
  status: Exclude<QuoteStatus, 'WITHDRAWN'>;

  /** Recorded on the timeline. Worth insisting on for a LOST. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AssignCraneQuoteDto {
  @IsString()
  @IsNotEmpty({ message: 'Provide the engineer to assign this to.' })
  @MaxLength(150)
  assignedTo: string;
}

export class AddCraneQuoteNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'A note cannot be empty.' })
  @MaxLength(2000)
  note: string;
}
