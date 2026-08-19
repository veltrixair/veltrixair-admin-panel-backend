import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegionMaster } from '../master-data/entities/region-master.entity';
import { AdminInsightsController } from './admin-insights.controller';
import { Article } from './entities/article.entity';
import { InsightsService } from './insights.service';
import { PublicInsightsController } from './public-insights.controller';

/**
 * Card grid for /insights/ — type, topic and region filters, keyword search,
 * sort and pagination.
 *
 * Article bodies and detail pages are deliberately out of scope: the site links
 * cards by hash anchor, and there is no article page to serve yet.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Article, RegionMaster])],
  controllers: [PublicInsightsController, AdminInsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
