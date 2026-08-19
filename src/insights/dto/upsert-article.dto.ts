import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ARTICLE_STATUSES, READING_UNITS } from '../entities/article.entity';
import type { ArticleStatus, ReadingUnit } from '../entities/article.entity';

export class CreateArticleDto {
  @IsString()
  @MaxLength(200)
  slug: string;

  @IsString()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  dek?: string;

  @IsString()
  @MaxLength(150)
  authorName: string;

  @Type(() => Number)
  @IsInt()
  typeCode: number;

  @Type(() => Number)
  @IsInt()
  topicCode: number;

  /** One or more region codes; "KSA & India" pieces carry two. */
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  regionCodes: number[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  readingValue: number;

  @IsIn(READING_UNITS)
  readingUnit: ReadingUnit;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsIn(ARTICLE_STATUSES)
  status?: ArticleStatus;

  @IsOptional()
  @IsISO8601()
  publishedAt?: string;
}

/** Every field optional — PATCH semantics. */
export class UpdateArticleDto extends CreateArticleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  declare slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  declare title: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  declare authorName: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  declare typeCode: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  declare topicCode: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  declare regionCodes: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare readingValue: number;

  @IsOptional()
  @IsIn(READING_UNITS)
  declare readingUnit: ReadingUnit;
}

export class AttachAssetDto {
  /** Id returned by POST /admin/files/upload. */
  @IsUUID()
  fileId: string;
}

export class UpdateArticleStatusDto {
  @IsIn(ARTICLE_STATUSES)
  status: ArticleStatus;
}
