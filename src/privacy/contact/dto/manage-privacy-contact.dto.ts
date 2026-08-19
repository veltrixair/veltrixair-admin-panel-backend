import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ToBoolean } from '../../../common/transformers/to-boolean.transformer';
import { PRIVACY_ENQUIRY_STATUSES } from '../entities/privacy-contact-enquiry.entity';
import type { PrivacyEnquiryStatus } from '../entities/privacy-contact-enquiry.entity';

export class ListPrivacyContactDto extends PaginationQueryDto {
  /** Matches name, organisation, email or reference number. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(PRIVACY_ENQUIRY_STATUSES, {
    message: `status must be one of: ${PRIVACY_ENQUIRY_STATUSES.join(', ')}`,
  })
  status?: PrivacyEnquiryStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  jurisdictionCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceCode?: number;

  /** Past the one-working-day promise and still untouched. */
  @IsOptional()
  @ToBoolean()
  overdue?: boolean;

  /** Nobody has picked it up yet. */
  @IsOptional()
  @ToBoolean()
  unassigned?: boolean;
}

export class UpdatePrivacyContactStatusDto {
  @IsIn(PRIVACY_ENQUIRY_STATUSES, {
    message: `status must be one of: ${PRIVACY_ENQUIRY_STATUSES.join(', ')}`,
  })
  status: PrivacyEnquiryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * Assigning, or handing back.
 *
 * `assignedTo` may be sent as null to unassign — which also clears
 * `assignedAt`, since the two move together and a CHECK constraint says so.
 */
export class AssignPrivacyContactDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Provide a practitioner, or null to unassign.' })
  @MaxLength(150)
  assignedTo?: string | null;
}

export class AddPrivacyContactNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'A note cannot be empty.' })
  @MaxLength(2000)
  note: string;
}
