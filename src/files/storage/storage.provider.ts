/**
 * Storage abstraction.
 *
 * Supabase Storage is the production driver. The interface exists so the choice
 * stays reversible — the same seam pattern as MailService and VirusScanner —
 * and so the upload pipeline can be exercised locally without a service-role
 * key present.
 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StorageProvider {
  /** Human-readable driver name, surfaced in logs and health output. */
  readonly name: string;

  /** Writes an object. `key` is generated server-side, never client-supplied. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;

  /**
   * A time-limited read URL. Objects live in a private bucket, so this is the
   * only way to reach one — there is no public object URL to leak.
   */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;

  /** Hard delete. Used by retention purges and erasure requests. */
  remove(key: string): Promise<void>;
}
