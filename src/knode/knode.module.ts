import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminKnodeController } from './admin-knode.controller';
import { KnodeLeadEvent } from './entities/knode-lead-event.entity';
import { KnodeLead } from './entities/knode-lead.entity';
import { KnodeService } from './knode.service';
import { PublicKnodeController } from './public-knode.controller';

/**
 * Leads captured on the last slide of the Knode HMS product deck.
 *
 * Same two-controller split as the other modules — the surface anyone can
 * reach and the surface staff can reach are separate files, so "can an
 * unauthenticated caller hit this?" is answerable from the filename. Here the
 * anonymous caller is the deck itself rather than a website visitor.
 */
@Module({
  imports: [TypeOrmModule.forFeature([KnodeLead, KnodeLeadEvent])],
  controllers: [PublicKnodeController, AdminKnodeController],
  providers: [KnodeService],
  exports: [KnodeService],
})
export class KnodeModule {}
