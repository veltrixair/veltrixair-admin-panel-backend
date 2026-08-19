import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

  constructor(private readonly config: ConfigService) {}

  async send(message: MailMessage): Promise<boolean> {
    try {
      await this.dispatch(message);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send "${message.subject}" to ${message.to}: ${(error as Error).message}`,
      );
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
