import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnodeModuleMaster } from '../master-data/entities/knode-module-master.entity';
import { AdminKnodeDemoController } from './admin-knode-demo.controller';
import { KnodeDemoRequestEvent } from './entities/knode-demo-request-event.entity';
import { KnodeDemoRequestModule } from './entities/knode-demo-request-module.entity';
import { KnodeDemoRequest } from './entities/knode-demo-request.entity';
import { KnodeDemoService } from './knode-demo.service';
import { PublicKnodeDemoController } from './public-knode-demo.controller';

/**
 * "Book a demo" on knode.veltrixair.com.
 *
 * Same two-controller split as the rest of the codebase — the surface anyone
 * can reach and the surface staff can reach are separate files, so "can an
 * unauthenticated caller hit this?" is answerable from the filename.
 *
 * The module master is imported here as well as in MasterDataModule because
 * the service reads it on every submission: which modules have shipped is what
 * decides whether an enquiry is a demo or a place on a waiting list.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnodeDemoRequest,
      KnodeDemoRequestModule,
      KnodeDemoRequestEvent,
      KnodeModuleMaster,
    ]),
  ],
  controllers: [PublicKnodeDemoController, AdminKnodeDemoController],
  providers: [KnodeDemoService],
  exports: [KnodeDemoService],
})
export class KnodeDemoModule {}
