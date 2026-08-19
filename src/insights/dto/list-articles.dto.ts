import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ARTICLE_STATUSES } from '../entities/article.entity';
import type { ArticleStatus } from '../entities/article.entity';

/** Matches the SORT dropdown on /insights/. */
export const ARTICLE_SORTS = ['newest', 'oldest', 'reading-time'] as const;
export type ArticleSort = (typeof ARTICLE_SORTS)[number];

/** Mirrors the three filter rows, the search box and the sort control. */
export class ListArticlesDto extends PaginationQueryDto {
  /** TYPE chip — slug form, e.g. "case-study". Omit for "All". */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  type?: string;

  /** TOPIC chip — slug form, e.g. "data-privacy". Omit for "All". */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  topic?: string;

  /** REGION chip — slug form, e.g. "ksa". Omit for "All". */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  /** "Search by topic, author, or keyword" — matches title, dek and author. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @IsOptional()
  @IsIn(ARTICLE_SORTS)
  sort?: ArticleSort;
}

/** Admin-only: exposes drafts and archived pieces. */
export class ListArticlesAdminDto extends ListArticlesDto {
  @IsOptional()
  @IsIn(ARTICLE_STATUSES)
  status?: ArticleStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  typeCode?: number;
}
