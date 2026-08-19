import { Article } from '../entities/article.entity';
import type { ReadingUnit } from '../entities/article.entity';

export interface TaxonomyRef {
  code: number;
  name: string;
  slug: string;
}

export interface ArticleTypeRef extends TaxonomyRef {
  /** Badge colour for the card and the filter chip. */
  colourHex: string | null;
}

export interface ArticleCard {
  id: string;
  slug: string;
  title: string;
  dek: string | null;
  authorName: string;
  type: ArticleTypeRef | null;
  topic: TaxonomyRef | null;
  regions: TaxonomyRef[];
  reading: {
    value: number;
    unit: ReadingUnit;
    /** Ready to print: "14 min read" or "PDF · 32 pages". */
    label: string;
    estimatedMinutes: number;
  };
  publishedAt: Date | null;
  /** True while the content team has not written the card description. */
  dekPending: boolean;
  /**
   * The downloadable asset, when one is attached. Gated — the URL is issued
   * only after `POST /insights/articles/:slug/download` captures a lead.
   */
  asset: { fileName: string; sizeBytes: number } | null;
  /** True for a Whitepaper card that has no file behind it yet. */
  assetPending: boolean;
}

export function formatReading(value: number, unit: ReadingUnit): string {
  return unit === 'PAGES' ? `PDF · ${value} pages` : `${value} min read`;
}

/** Pages take longer than a minute each; used only for the reading-time sort. */
export const MINUTES_PER_PAGE = 3;

export function toEstimatedMinutes(value: number, unit: ReadingUnit): number {
  return unit === 'PAGES' ? value * MINUTES_PER_PAGE : value;
}

export function toArticleCard(article: Article): ArticleCard {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    dek: article.dek,
    authorName: article.authorName,
    type: article.type
      ? {
          code: article.type.typeCode,
          name: article.type.typeName,
          slug: article.type.slug,
          colourHex: article.type.colourHex,
        }
      : null,
    topic: article.topic
      ? {
          code: article.topic.topicCode,
          name: article.topic.topicName,
          slug: article.topic.slug,
        }
      : null,
    regions: (article.regions ?? []).map((r) => ({
      code: r.regionCode,
      name: r.regionName,
      slug: r.slug,
    })),
    reading: {
      value: article.readingValue,
      unit: article.readingUnit,
      label: formatReading(article.readingValue, article.readingUnit),
      estimatedMinutes: article.estimatedMinutes,
    },
    publishedAt: article.publishedAt,
    dekPending: !article.dek,
    asset: article.assetFile
      ? {
          fileName: article.assetFile.originalName,
          sizeBytes: article.assetFile.sizeBytes,
        }
      : null,
    // Only whitepapers promise a file, so only they can be missing one.
    assetPending: article.readingUnit === 'PAGES' && !article.assetFileId,
  };
}
