import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { resolveMx } from 'dns/promises';

export interface SpamCheckInput {
  /** Hidden honeypot field — bots fill it, humans never see it. */
  honeypot?: string;
  /** Cloudflare Turnstile response token from the browser. */
  captchaToken?: string;
  email: string;
  ip?: string;
}

export interface SpamCheckResult {
  /** 0 = clean. Higher is more suspicious. */
  score: number;
  reasons: string[];
  /** True when the submission should be stored with status SPAM. */
  isSpam: boolean;
}

/** Deliberately small starter list — extend from a maintained source later. */
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
]);

const SPAM_THRESHOLD = 50;

/**
 * Weights are tuned so that no single *inferred* signal can condemn a lead on
 * its own — only deliberate bot behaviour can.
 *
 * HONEYPOT and CAPTCHA are near-conclusive: a human never fills a hidden field.
 *
 * NO_MX is deliberately below the threshold. `resolveMx` fails on transient
 * resolver problems as well as genuinely mail-less domains, and this module's
 * whole premise is that a false positive must never lose a real enterprise
 * lead. A missing MX record now *contributes* to the score and is recorded in
 * `reasons` for review, but it takes a second signal to cross the line.
 */
const WEIGHTS = {
  HONEYPOT: 100,
  CAPTCHA_FAILED: 100,
  DISPOSABLE_DOMAIN: 60,
  NO_MX_RECORD: 30,
} as const;

@Injectable()
export class SpamCheckService {
  private readonly logger = new Logger(SpamCheckService.name);

  constructor(private readonly config: ConfigService) {}

  async evaluate(input: SpamCheckInput): Promise<SpamCheckResult> {
    const reasons: string[] = [];
    let score = 0;

    // 1. Honeypot — a filled hidden field is close to conclusive.
    if (input.honeypot && input.honeypot.trim().length > 0) {
      score += WEIGHTS.HONEYPOT;
      reasons.push('honeypot_filled');
    }

    // 2. Turnstile. Skipped when no secret is configured so local dev works
    //    without Cloudflare; enforced the moment a secret exists.
    const turnstileSecret = this.config.get<string>('TURNSTILE_SECRET');
    if (turnstileSecret) {
      const passed = await this.verifyTurnstile(
        turnstileSecret,
        input.captchaToken,
        input.ip,
      );
      if (!passed) {
        score += WEIGHTS.CAPTCHA_FAILED;
        reasons.push('captcha_failed');
      }
    }

    const domain = input.email.split('@')[1]?.toLowerCase();

    // 3. Disposable address.
    if (domain && DISPOSABLE_DOMAINS.has(domain)) {
      score += WEIGHTS.DISPOSABLE_DOMAIN;
      reasons.push('disposable_domain');
    }

    // 4. Can the domain receive mail at all? A contributing signal only —
    //    see WEIGHTS above for why this cannot condemn a lead by itself.
    if (domain && !(await this.hasMxRecord(domain))) {
      score += WEIGHTS.NO_MX_RECORD;
      reasons.push('no_mx_record');
    }

    return { score, reasons, isSpam: score >= SPAM_THRESHOLD };
  }

  /**
   * HMAC the caller's IP rather than storing it. Raw IPs are personal data
   * under PDPL and GDPR, and this table already claims regulated handling.
   */
  hashIp(ip: string | undefined): string | null {
    if (!ip) return null;
    const pepper = this.config.getOrThrow<string>('IP_PEPPER');
    return createHmac('sha256', pepper).update(ip).digest('hex');
  }

  private async verifyTurnstile(
    secret: string,
    token: string | undefined,
    ip: string | undefined,
  ): Promise<boolean> {
    if (!token) return false;

    try {
      const body = new URLSearchParams({ secret, response: token });
      if (ip) body.append('remoteip', ip);

      const response = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        { method: 'POST', body },
      );
      const result = (await response.json()) as { success?: boolean };
      return result.success === true;
    } catch (error) {
      // Never let the anti-spam provider being down reject a real enquiry.
      this.logger.warn(
        `Turnstile verification failed to complete: ${(error as Error).message}`,
      );
      return true;
    }
  }

  private async hasMxRecord(domain: string): Promise<boolean> {
    try {
      const records = await resolveMx(domain);
      return records.length > 0;
    } catch {
      return false;
    }
  }
}
