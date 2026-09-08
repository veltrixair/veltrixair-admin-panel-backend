import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminNotificationController } from './admin-notification.controller';
import { Notification } from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';
import { NotificationService } from './notification.service';

/**
 * Global for the same reason FilesModule is: every module that does anything
 * worth announcing needs to raise one, and threading an import through each of
 * them would be ceremony with no benefit. Nothing here imports anything back,
 * so there is no cycle to create.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotificationRead])],
  controllers: [AdminNotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
