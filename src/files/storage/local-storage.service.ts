import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { StorageProvider } from './storage.provider';

/**
 * Filesystem driver for local development.
 *
 * Selected only when Supabase credentials are absent, so the upload pipeline
 * can be exercised end-to-end before a service-role key exists. NOT suitable
 * for production: containers are ephemeral and a second instance would not see
 * the first instance's files.
 *
 * Signed URLs are emulated with an HMAC over key and expiry, so the download
 * route behaves the same way under both drivers.
 */
@Injectable()
export class LocalStorageService implements StorageProvider {
  readonly name = 'local';

  private readonly logger = new Logger(LocalStorageService.name);
  private readonly root: string;
  private readonly secret: string;
  private readonly publicBase: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('LOCAL_STORAGE_DIR', 'storage'));
    // Reuses the IP pepper rather than adding another secret: both are
    // server-side signing keys with the same lifetime.
    this.secret = config.get<string>(
      'IP_PEPPER',
      randomBytes(32).toString('hex'),
    );
    this.publicBase = config.get<string>('PORT', '3000');
  }

  private pathFor(key: string): string {
    const full = resolve(join(this.root, key));
    // Defence in depth: keys are server-generated, but a traversal here would
    // let a bug write anywhere on disk.
    if (!full.startsWith(this.root)) {
      throw new Error('Resolved path escapes the storage root');
    }
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = this.sign(key, expires);
    return Promise.resolve(
      `http://localhost:${this.publicBase}/files/local/${encodeURIComponent(key)}?expires=${expires}&signature=${signature}`,
    );
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  // --- Local-only helpers used by the download route -----------------------

  sign(key: string, expires: number): string {
    return createHmac('sha256', this.secret)
      .update(`${key}:${expires}`)
      .digest('hex');
  }

  async read(key: string, expires: number, signature: string): Promise<Buffer> {
    if (expires < Math.floor(Date.now() / 1000)) {
      throw new NotFoundException('This link has expired');
    }
    if (this.sign(key, expires) !== signature) {
      throw new NotFoundException('Invalid link');
    }
    const path = this.pathFor(key);
    if (!existsSync(path)) throw new NotFoundException('File not found');
    return readFile(path);
  }
}
