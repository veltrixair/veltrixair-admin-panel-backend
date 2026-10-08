import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ToBoolean } from '../../../common/transformers/to-boolean.transformer';
import { VISIT_STATUSES } from '../entities/crane-site-visit.entity';
import type { VisitStatus } from '../entities/crane-site-visit.entity';

export class ListCraneSiteVisitsDto extends PaginationQueryDto {
  /** Matches company, contact name, email or reference number. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(VISIT_STATUSES, {
    message: `status must be one of: ${VISIT_STATUSES.join(', ')}`,
  })
  status?: VisitStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  visitPurposeCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  visitUrgencyCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  siteCityCode?: number;

  /** Which visits are billable — the engagement-type field, filtered. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  engagementTypeCode?: number;

  /** Past the 48-hour coordination promise and still untouched. */
  @IsOptional()
  @ToBoolean()
  overdue?: boolean;
}

/**
 * CANCELLED is admin-settable; the customer cancels through their token.
 *
 * SCHEDULED is absent: a date and the status move together, through
 * `/schedule`. Setting it here would leave `scheduled_at` null, and the
 * customer's tracking page would show a confirmed visit with no date on it.
 */
const SETTABLE = VISIT_STATUSES.filter((s) => s !== 'SCHEDULED');

export class UpdateCraneSiteVisitStatusDto {
  @IsIn(SETTABLE, {
    message: `status must be one of: ${SETTABLE.join(', ')}`,
  })
  status: Exclude<VisitStatus, 'SCHEDULED'>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * Confirming the visit. Setting a date moves the request to SCHEDULED in the
 * same call — a confirmed date that leaves the status behind is how a
 * coordinator ends up chasing something already booked.
 */
export class ScheduleCraneSiteVisitDto {
  @IsDateString(
    {},
    {
      message:
        'scheduledAt must be an ISO date-time, e.g. 2026-09-14T07:00:00Z',
    },
  )
  scheduledAt: string;

  /** An engineer from the roster. Optional here — a date can be confirmed
      before anybody is picked. */
  @IsOptional()
  @IsUUID()
  engineerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * Assigning a visit, by roster id rather than by typed name.
 *
 * The column behind this used to be free text and still exists for the
 * visits recorded that way. New assignments name a real engineer, so the
 * same person is spelled the same way every time and the desk can see what
 * each of them is carrying.
 */
export class AssignCraneSiteVisitDto {
  @IsUUID('4', { message: 'Choose an engineer from the list.' })
  engineerId: string;
}

export class AddCraneSiteVisitNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'A note cannot be empty.' })
  @MaxLength(2000)
  note: string;
}
