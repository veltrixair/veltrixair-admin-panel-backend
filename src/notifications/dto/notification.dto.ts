import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '../entities/notification.entity';

export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** One of the filter chips. Omitted means all of them. */
  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORIES)
  category?: NotificationCategory;

  /**
   * A query string carries "true", not true. Without this the validator
   * rejects every use of the flag, which is the classic silent 400 on a
   * boolean filter.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;
}
