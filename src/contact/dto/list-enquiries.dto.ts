import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ENQUIRY_STATUSES } from '../entities/contact-enquiry.entity';
import type { EnquiryStatus } from '../entities/contact-enquiry.entity';

export class ListEnquiriesDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ENQUIRY_STATUSES)
  status?: EnquiryStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  topicCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  officeCode?: number;

  /** Matches company or full name, case-insensitive. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Only enquiries whose SLA has elapsed without a first response. */
  @IsOptional()
  @IsIn(['true', 'false'])
  overdue?: string;
}
