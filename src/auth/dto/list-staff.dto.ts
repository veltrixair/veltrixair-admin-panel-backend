import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ToBoolean } from '../../common/transformers/to-boolean.transformer';

export class ListStaffDto extends PaginationQueryDto {
  /** Matches on name or email. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  roleCode?: number;

  /**
   * Omit to see everyone; deactivated accounts are included by default.
   *
   * ToBoolean, not a plain @Transform: `?isActive=false` used to filter for
   * ACTIVE accounts, because implicit conversion turns any non-empty string
   * into true before the transform runs.
   */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
