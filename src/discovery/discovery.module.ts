import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArchitectIndustryMaster } from '../master-data/entities/architect-industry-master.entity';
import { AdminDiscoveryController } from './admin-discovery.controller';
import { ArchitectService } from './architect.service';
import { BookingService } from './booking.service';
import { ArchitectAvailabilityRule } from './entities/architect-availability-rule.entity';
import { ArchitectBlackout } from './entities/architect-blackout.entity';
import { Architect } from './entities/architect.entity';
import { DiscoveryBookingEvent } from './entities/discovery-booking-event.entity';
import { DiscoveryBooking } from './entities/discovery-booking.entity';
import { SessionSlot } from './entities/session-slot.entity';
import { PublicDiscoveryController } from './public-discovery.controller';
import { SlotService } from './slot.service';

/**
 * Discovery sessions for /talk-to-architect/ — Phase 1.
 *
 * Covers architects, slot generation, timezone-correct availability, atomic
 * booking and confirmation email. Calendar-provider sync, rescheduling and the
 * holiday calendar are deliberately out of scope.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Architect,
      ArchitectAvailabilityRule,
      ArchitectBlackout,
      SessionSlot,
      DiscoveryBooking,
      DiscoveryBookingEvent,
      ArchitectIndustryMaster,
    ]),
  ],
  controllers: [PublicDiscoveryController, AdminDiscoveryController],
  providers: [SlotService, BookingService, ArchitectService],
  exports: [SlotService, BookingService, ArchitectService],
})
export class DiscoveryModule {}
