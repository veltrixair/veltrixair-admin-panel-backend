import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ENQUIRY_STATUSES } from '../entities/contact-enquiry.entity';
import type { EnquiryStatus } from '../entities/contact-enquiry.entity';

export class UpdateEnquiryStatusDto {
  @IsIn(ENQUIRY_STATUSES)
  status: EnquiryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AssignEnquiryDto {
  @IsString()
  @MaxLength(150)
  assignedTo: string;
}

export class AddEnquiryNoteDto {
  @IsString()
  @MaxLength(2000)
  note: string;
}
