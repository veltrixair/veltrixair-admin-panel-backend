import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider } from './storage.provider';

/**
 * Supabase Storage over its REST API.
 *
 * Uses `fetch` rather than `@supabase/supabase-js` — three endpoints do not
 * justify the dependency, and going direct keeps the failure modes visible.
 *
 * The bucket must be PRIVATE. Every read goes through a signed URL, so a
 * public bucket would silently defeat the gating on whitepapers and expose
 * anything else stored alongside them.
 */
@Injectable()
export class SupabaseStorageService implements StorageProvider {
  readonly name = 'supabase';

  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.baseUrl = config
      .getOrThrow<string>('SUPABASE_URL')
      .replace(/\/+$/, '');
    this.serviceKey = config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.bucket = config.get<string>(
      'SUPABASE_STORAGE_BUCKET',
      'veltrixair-assets',
    );
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.serviceKey}`,
      apikey: this.serviceKey,
      ...extra,
    };
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/storage/v1/object/${this.bucket}/${key}`,
      {
        method: 'POST',
        headers: this.headers({
          'Content-Type': contentType,
          'x-upsert': 'false',
        }),
        body: new Uint8Array(body),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `Upload failed (${response.status}) for ${key}: ${detail.slice(0, 200)}`,
      );
      throw new InternalServerErrorException('Could not store the file');
    }
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/storage/v1/object/sign/${this.bucket}/${key}`,
      {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expiresIn: ttlSeconds }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `Signing failed (${response.status}) for ${key}: ${detail.slice(0, 200)}`,
      );
      throw new InternalServerErrorException(
        'Could not produce a download link',
      );
    }

    const { signedURL, signedUrl } = (await response.json()) as {
      signedURL?: string;
      signedUrl?: string;
    };
    const path = signedURL ?? signedUrl;
    if (!path) {
      throw new InternalServerErrorException('Storage returned no signed URL');
    }

    return `${this.baseUrl}/storage/v1${path.startsWith('/') ? '' : '/'}${path}`;
  }

  async remove(key: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/storage/v1/object/${this.bucket}/${key}`,
      { method: 'DELETE', headers: this.headers() },
    );

    // A missing object is an acceptable outcome for a delete — retention
    // purges and erasure both want "it is gone", not "it was there first".
    if (!response.ok && response.status !== 404) {
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `Delete failed (${response.status}) for ${key}: ${detail.slice(0, 200)}`,
      );
      throw new InternalServerErrorException('Could not delete the file');
    }
  }
}
