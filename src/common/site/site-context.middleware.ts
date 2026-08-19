import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { NextFunction, Request, Response } from 'express';
import { SiteMaster } from '../../master-data/entities/site-master.entity';

export interface SiteRequest extends Request {
  /** Set for public routes only. Admin routes read the site from the token. */
  siteCode?: number;
}

/**
 * Works out which brand an anonymous request belongs to.
 *
 * Admin requests carry their site in a signed token, so they never come here.
 * Public requests carry nothing — a contact form on veltrixairindustries.com
 * and one on veltrixair.com hit the same backend and look identical apart from
 * where the browser came from. That origin is the only signal available, so it
 * is what decides.
 *
 * `X-Site-Code` is honoured as an override because in development all three
 * frontends run on localhost and would otherwise be indistinguishable. It is
 * safe to accept here in a way it would NOT be on an admin route: the worst a
 * forged value can do is file your own enquiry under the wrong brand. It grants
 * no read access to anything.
 *
 * Anything unrecognised is a 400 rather than a silent default to IT. A form
 * quietly filing crane enquiries into the IT pipeline is far harder to notice
 * than one that fails loudly on the first submission.
 */
@Injectable()
export class SiteContextMiddleware implements NestMiddleware {
  /** Three rows that change approximately never. */
  private cache: Map<string, number> | null = null;
  private codes: Set<number> = new Set();

  constructor(
    @InjectRepository(SiteMaster)
    private readonly siteRepo: Repository<SiteMaster>,
  ) {}

  async use(
    req: SiteRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const { byDomain, codes } = await this.load();

    const explicit = req.get('x-site-code');
    if (explicit) {
      const code = Number(explicit);
      if (!codes.has(code)) {
        throw new BadRequestException(`Unknown site code: ${explicit}`);
      }
      req.siteCode = code;
      return next();
    }

    // Origin first — it is what a browser sends on a cross-origin form post.
    // Host is the fallback for same-origin and server-to-server calls.
    const origin = req.get('origin');
    const host = origin ? this.hostOf(origin) : req.hostname;
    const code = byDomain.get(this.normalise(host));

    if (!code) {
      throw new BadRequestException(
        `Cannot tell which Veltrixair site this request is for (host "${host}"). ` +
          `Send an X-Site-Code header.`,
      );
    }

    req.siteCode = code;
    next();
  }

  private async load(): Promise<{
    byDomain: Map<string, number>;
    codes: Set<number>;
  }> {
    if (this.cache) return { byDomain: this.cache, codes: this.codes };

    const sites = await this.siteRepo.find({
      where: { isActive: true, isDeleted: false },
    });

    const byDomain = new Map<string, number>();
    for (const site of sites) {
      this.codes.add(site.siteCode);
      if (site.publicDomain) {
        byDomain.set(this.normalise(site.publicDomain), site.siteCode);
      }
      byDomain.set(this.normalise(site.adminDomain), site.siteCode);
    }

    this.cache = byDomain;
    return { byDomain, codes: this.codes };
  }

  private hostOf(origin: string): string {
    try {
      return new URL(origin).hostname;
    } catch {
      return origin;
    }
  }

  /** `www.` is a prefix people type, not a different brand. */
  private normalise(host: string): string {
    return host
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');
  }
}
