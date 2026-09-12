import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider } from './storage.provider';

/**
 * Amazon S3.
 *
 * The bucket must be PRIVATE, for the same reason the Supabase one is: every
 * read goes through a time-limited signed URL, so a public bucket would
 * silently defeat the gating on whitepapers while exposing the CVs and
 * onboarding documents stored alongside them.
 *
 * Credentials are deliberately absent from the client configuration. On EC2
 * the SDK resolves the instance role by itself, so no access key is ever
 * written to the server or to an environment file; locally it falls back to
 * ~/.aws/credentials. The only thing that changes between the two is which
 * identity the SDK happens to find.
 */
@Injectable()
export class S3StorageService implements StorageProvider {
  readonly name = 's3';

  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    // getOrThrow rather than get: a missing bucket name should stop the
    // application at boot, not surface as a failed upload an hour later when
    // somebody attaches a CV.
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      region: config.getOrThrow<string>('AWS_REGION'),
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Upload failed for ${key}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Could not store the file');
    }
  }

  /**
   * One difference from the Supabase driver worth knowing about: signing is a
   * local computation against the credentials, not a call to S3. It therefore
   * succeeds for a key that does not exist, handing back a working-looking
   * URL that returns NoSuchKey when followed.
   *
   * That is acceptable here because every caller has just read the row out of
   * `stored_files`, so the object is known to have been written. It would not
   * be acceptable as an existence check, and must not be used as one.
   */
  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: ttlSeconds },
      );
    } catch (error) {
      this.logger.error(
        `Signing failed for ${key}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Could not produce a download link',
      );
    }
  }

  async remove(key: string): Promise<void> {
    try {
      // S3 deletes are idempotent: removing a key that is not there succeeds.
      // That is exactly what retention purges and erasure requests want — "it
      // is gone", not "it was there first" — so unlike the Supabase driver
      // there is no 404 to special-case.
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.error(
        `Delete failed for ${key}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Could not delete the file');
    }
  }
}
