import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FEATURE } from '../auth/permissions.constants';
import { NotificationService } from '../notifications/notification.service';

export interface MailMessage {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

/**
 * Transactional mail.
 *
 * The transport is intentionally a seam: today it logs, so the app runs
 * without provider credentials. Swap `dispatch()` for SES/Resend/Postmark
 * without touching any caller.
 *
 * Sending never throws. An enquiry is already committed by the time mail goes
 * out — a provider outage must not fail the HTTP request or lose the lead.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    // NotificationsModule is @Global, so this needs no import here.
    private readonly notifications: NotificationService,
  ) {}

  /**
   * `context.siteCode` turns a failure into something somebody sees.
   *
   * Without it a bounce is a line in a log nobody reads, and the person who
   * was supposed to receive an acknowledgement simply never gets one. This
   * service is global and knows nothing about brands, so the caller has to say
   * which dashboard should be told; callers that do not pass it keep the old
   * behaviour of logging and moving on.
   */
  async send(
    message: MailMessage,
    context?: { siteCode: number },
  ): Promise<boolean> {
    try {
      await this.dispatch(message);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send "${message.subject}" to ${message.to}: ${(error as Error).message}`,
      );

      if (context) {
        await this.notifications.raise({
          siteCode: context.siteCode,
          featureCode: FEATURE.ADMINS,
          category: 'system',
          lead: 'Email failed to send',
          body: `${message.to} · "${message.subject}"`,
          link: '/settings',
          sourceType: 'mail_failure',
          // Nobody chose for this to happen, so it reaches everyone who could
          // act on it rather than excluding an actor.
          sourceId: null,
        });
      }

      return false;
    }
  }

  private dispatch(message: MailMessage): Promise<void> {
    const from = this.config.getOrThrow<string>('MAIL_FROM');

    // TODO: replace with a real transport (SES / Resend / Postmark).
    this.logger.log(
      `[mail] from=${from} to=${message.to} subject="${message.subject}"`,
    );
    this.logger.debug(`[mail] body:\n${message.body}`);

    return Promise.resolve();
  }
}
