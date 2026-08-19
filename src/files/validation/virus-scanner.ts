import { Injectable, Logger } from '@nestjs/common';
import type { ScanStatus } from '../entities/stored-file.entity';

export const VIRUS_SCANNER = Symbol('VIRUS_SCANNER');

export interface VirusScanner {
  readonly name: string;
  scan(buffer: Buffer): Promise<ScanStatus>;
}

/**
 * Placeholder scanner.
 *
 * Returns PENDING rather than pretending a file is clean — an unscanned file
 * should not be indistinguishable from a scanned one. Whether PENDING files
 * can be downloaded is governed by `SCAN_REQUIRED`, so this ships usable today
 * and tightens the moment a real scanner exists.
 *
 * Replacing it means implementing this interface against ClamAV or a hosted
 * service and swapping the provider — no caller changes.
 */
@Injectable()
export class NoopVirusScanner implements VirusScanner {
  readonly name = 'noop';
  private readonly logger = new Logger(NoopVirusScanner.name);

  scan(): Promise<ScanStatus> {
    this.logger.debug('No virus scanner configured — marking file PENDING');
    return Promise.resolve('PENDING');
  }
}
