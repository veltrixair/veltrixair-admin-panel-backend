import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { RegionMaster } from '../master-data/entities/region-master.entity';
import { toArticleCard, toEstimatedMinutes } from './dto/article-response.dto';
import type { ArticleCard } from './dto/article-response.dto';
import { ListArticlesAdminDto, ListArticlesDto } from './dto/list-articles.dto';
import { CreateArticleDto, UpdateArticleDto } from './dto/upsert-article.dto';
import { Article } from './entities/article.entity';
import type { ArticleStatus } from './entities/article.entity';

@Injectable()
export class InsightsService {
  constructor(
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    @InjectRepository(RegionMaster)
    private readonly regionRepo: Repository<RegionMaster>,
  ) {}

  // -----------------------------------------------------------------------
  // Public
  // -----------------------------------------------------------------------

  /** Published cards only. */
  async listPublic(
    query: ListArticlesDto,
    siteCode: number,
  ): Promise<PaginatedResult<ArticleCard>> {
    const qb = this.baseQuery(query, siteCode).andWhere(
      'article.status = :status',
      {
        status: 'PUBLISHED',
      },
    );

    const page = await this.paginate(qb, query);
    return { ...page, items: page.items.map(toArticleCard) };
  }

  // -----------------------------------------------------------------------
  // Admin
  // -----------------------------------------------------------------------

  async listForAdmin(
    query: ListArticlesAdminDto,
    siteCode: number,
  ): Promise<PaginatedResult<Article>> {
    const qb = this.baseQuery(query, siteCode);

    if (query.status) {
      qb.andWhere('article.status = :status', { status: query.status });
    }
    if (query.typeCode !== undefined) {
      qb.andWhere('article.typeCode = :typeCode', { typeCode: query.typeCode });
    }

    return this.paginate(qb, query);
  }

  /** The other choke point — create, update, status and remove all use it. */
  async findById(id: string, siteCode: number): Promise<Article> {
    const article = await this.articleRepo.findOne({
      where: { id, isDeleted: false, siteCode },
      relations: { type: true, topic: true, regions: true, assetFile: true },
    });
    if (!article) {
      throw new NotFoundException(`Article ${id} not found`);
    }
    return article;
  }

  /** Published article by slug — the entry point for a gated download. */
  async findPublishedBySlug(slug: string, siteCode: number): Promise<Article> {
    const article = await this.articleRepo.findOne({
      where: { slug, isDeleted: false, status: 'PUBLISHED', siteCode },
      relations: { type: true, topic: true, regions: true, assetFile: true },
    });
    if (!article) {
      throw new NotFoundException(`No published article found for "${slug}"`);
    }
    return article;
  }

  /** Attach an uploaded file as the article's downloadable asset. */
  async attachAsset(
    id: string,
    fileId: string,
    siteCode: number,
  ): Promise<Article> {
    await this.findById(id, siteCode);
    await this.articleRepo.update({ id }, { assetFileId: fileId });
    return this.findById(id, siteCode);
  }

  /** Detach without deleting the file — it may be reused elsewhere. */
  async detachAsset(id: string, siteCode: number): Promise<Article> {
    await this.findById(id, siteCode);
    await this.articleRepo.update({ id }, { assetFileId: null });
    return this.findById(id, siteCode);
  }

  async create(dto: CreateArticleDto, siteCode: number): Promise<Article> {
    await this.assertSlugFree(dto.slug, siteCode);

    const article = this.articleRepo.create({
      ...this.mapScalars(dto),
      siteCode,
      slug: dto.slug,
      title: dto.title,
      regions: await this.resolveRegions(dto.regionCodes),
    });

    const saved = await this.articleRepo.save(article);
    return this.findById(saved.id, siteCode);
  }

  async update(
    id: string,
    dto: UpdateArticleDto,
    siteCode: number,
  ): Promise<Article> {
    const article = await this.findById(id, siteCode);

    if (dto.slug && dto.slug !== article.slug) {
      await this.assertSlugFree(dto.slug, siteCode, id);
      article.slug = dto.slug;
    }
    if (dto.title !== undefined) article.title = dto.title;
    if (dto.regionCodes) {
      article.regions = await this.resolveRegions(dto.regionCodes);
    }

    Object.assign(article, this.mapScalars(dto, article));

    await this.articleRepo.save(article);
    return this.findById(id, siteCode);
  }

  async setStatus(
    id: string,
    status: ArticleStatus,
    siteCode: number,
  ): Promise<Article> {
    const article = await this.findById(id, siteCode);

    const patch: Partial<Article> = { status };
    if (status === 'PUBLISHED' && !article.publishedAt) {
      patch.publishedAt = new Date();
    }

    await this.articleRepo.update({ id }, patch);
    return this.findById(id, siteCode);
  }

  async remove(id: string, siteCode: number): Promise<{ message: string }> {
    await this.findById(id, siteCode);
    await this.articleRepo.update(
      { id },
      { isDeleted: true, status: 'ARCHIVED' },
    );
    return { message: 'Article removed' };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Every list goes through here — one filter binds them all. */
  private baseQuery(
    query: ListArticlesDto,
    siteCode: number,
  ): SelectQueryBuilder<Article> {
    const qb = this.articleRepo
      .createQueryBuilder('article')
      .leftJoinAndSelect('article.type', 'type')
      .leftJoinAndSelect('article.topic', 'topic')
      .leftJoinAndSelect('article.regions', 'region')
      .leftJoinAndSelect('article.assetFile', 'assetFile')
      .where('article.isDeleted = false')
      .andWhere('article.siteCode = :siteCode', { siteCode });

    if (query.type) {
      qb.andWhere('type.slug = :typeSlug', { typeSlug: query.type });
    }
    if (query.topic) {
      qb.andWhere('topic.slug = :topicSlug', { topicSlug: query.topic });
    }

    if (query.region) {
      // EXISTS rather than a filtered join, so filtering by one region does
      // not truncate the region list returned for each card.
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM article_regions ar
           INNER JOIN region_masters rm ON rm.region_code = ar.region_code
           WHERE ar.article_id = article.id AND rm.slug = :regionSlug
         )`,
        { regionSlug: query.region },
      );
    }

    // "Search by topic, author, or keyword"
    if (query.search) {
      qb.andWhere(
        `(article.title ILIKE :search
          OR article.dek ILIKE :search
          OR article.authorName ILIKE :search
          OR topic.topicName ILIKE :search)`,
        { search: `%${query.search}%` },
      );
    }

    switch (query.sort) {
      case 'oldest':
        qb.orderBy('article.publishedAt', 'ASC');
        break;
      case 'reading-time':
        // Normalised so "14 min" and "32 pages" order against each other.
        qb.orderBy('article.estimatedMinutes', 'ASC');
        break;
      case 'newest':
      default:
        qb.orderBy('article.publishedAt', 'DESC');
    }

    return qb;
  }

  private async paginate(
    qb: SelectQueryBuilder<Article>,
    query: ListArticlesDto,
  ): Promise<PaginatedResult<Article>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private async resolveRegions(codes: number[]): Promise<RegionMaster[]> {
    const regions = await this.regionRepo.find({
      where: { regionCode: In(codes), isActive: true, isDeleted: false },
    });

    if (regions.length !== codes.length) {
      const found = regions.map((r) => r.regionCode);
      const missing = codes.filter((c) => !found.includes(c));
      throw new BadRequestException(
        `Unknown region code(s): ${missing.join(', ')}`,
      );
    }
    return regions;
  }

  /**
   * Slugs are unique per brand — the migration made the index
   * (site_code, slug), so each business can publish its own "iso-42001".
   */
  private async assertSlugFree(
    slug: string,
    siteCode: number,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.articleRepo.findOne({
      where: { slug, siteCode },
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(
        `An article with slug "${slug}" already exists`,
      );
    }
  }

  private mapScalars(
    dto: UpdateArticleDto,
    current?: Article,
  ): Partial<Article> {
    const readingValue = dto.readingValue ?? current?.readingValue ?? 1;
    const readingUnit = dto.readingUnit ?? current?.readingUnit ?? 'MINUTES';

    return {
      dek: dto.dek ?? current?.dek ?? null,
      authorName: dto.authorName ?? current?.authorName,
      typeCode: dto.typeCode ?? current?.typeCode,
      topicCode: dto.topicCode ?? current?.topicCode,
      readingValue,
      readingUnit,
      // Kept in step with value/unit on every write so the sort never drifts.
      estimatedMinutes: toEstimatedMinutes(readingValue, readingUnit),
      displayOrder: dto.displayOrder ?? current?.displayOrder ?? 0,
      status: dto.status ?? current?.status ?? 'DRAFT',
      publishedAt: dto.publishedAt
        ? new Date(dto.publishedAt)
        : (current?.publishedAt ?? null),
    };
  }
}
