import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { LessThanOrEqual, Repository } from 'typeorm';
import { StoredFile } from './entities/stored-file.entity';
import type { FilePurpose } from './entities/stored-file.entity';
import { STORAGE_PROVIDER } from './storage/storage.provider';
import type { StorageProvider } from './storage/storage.provider';
import type { DetectedType } from './validation/file-signature.util';
import { verifySignature } from './validation/file-signature.util';
import { VIRUS_SCANNER } from './validation/virus-scanner';
import type { VirusScanner } from './validation/virus-scanner';

/** Just the parts of a multer file this service uses. */
export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
}

interface PurposePolicy {
  maxBytes: number;
  allowed: readonly DetectedType[];
  /** Months to keep, or null to keep indefinitely. */
  retentionMonths: number | null;
}

/**
 * Policy per purpose. A marketing asset and a job applicant's CV are stored by
 * the same code but governed by different rules — size, accepted formats and
 * above all how long they may be kept.
 */
const POLICIES: Record<FilePurpose, PurposePolicy> = {
  WHITEPAPER: {
    maxBytes: 25 * 1024 * 1024,
    allowed: ['pdf'],
    retentionMonths: null,
  },
  CAPABILITY_STATEMENT: {
    maxBytes: 25 * 1024 * 1024,
    allowed: ['pdf', 'docx'],
    retentionMonths: null,
  },
  RESUME: {
    maxBytes: 5 * 1024 * 1024,
    allowed: ['pdf', 'doc', 'docx'],
    retentionMonths: 12,
  },
  // Crane quote attachments: drawings, capacity plates, inspection
  // certificates. A larger cap than a CV because a general-arrangement drawing
  // is a big file, and kept far longer — a quote is a commercial record with
  // statutory retention behind it, not a document with a short shelf life.
  QUOTE_ATTACHMENT: {
    maxBytes: 20 * 1024 * 1024,
    allowed: ['pdf', 'doc', 'docx'],
    retentionMonths: 84,
  },
  /*
   * A candidate's ticket or card — ISO 9927, NDT Level II, a rigging licence.
   *
   * Images are accepted here and nowhere else: these are plastic cards, and a
   * candidate photographs one rather than scanning it to PDF. Twelve months to
   * match the application it belongs to, so a certificate is purged with the
   * record rather than outliving it.
   */
  CERTIFICATE: {
    maxBytes: 5 * 1024 * 1024,
    allowed: ['pdf', 'jpeg', 'png'],
    retentionMonths: 12,
  },
};

const MIME_BY_TYPE: Record<Exclude<DetectedType, 'unknown'>, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectRepository(StoredFile)
    private readonly fileRepo: Repository<StoredFile>,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(VIRUS_SCANNER) private readonly scanner: VirusScanner,
    private readonly config: ConfigService,
  ) {}

  static policyFor(purpose: FilePurpose): PurposePolicy {
    return POLICIES[purpose];
  }

  /**
   * `siteCode` is required rather than defaulted. One backend serves three
   * brands, and a stored object that cannot say which one it belongs to cannot
   * be listed, retained or purged correctly — a default would quietly file
   * everything under IT.
   */
  async upload(
    file: UploadedFile,
    purpose: FilePurpose,
    uploadedBy: string | null,
    siteCode: number,
  ): Promise<StoredFile> {
    const policy = POLICIES[purpose];

    if (file.size > policy.maxBytes) {
      throw new BadRequestException(
        `File exceeds the ${Math.round(policy.maxBytes / 1024 / 1024)} MB limit for ${purpose}`,
      );
    }

    // The decisive check. Declared MIME and extension are both client-supplied,
    // so only the leading bytes are evidence of what this actually is.
    const check = verifySignature(file.buffer, policy.allowed);
    if (!check.ok) {
      throw new BadRequestException(check.reason);
    }

    const detected = check.detected as Exclude<DetectedType, 'unknown'>;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    // Key is generated, never derived from the filename — that closes path
    // traversal and collisions in one move.
    const key = `${purpose.toLowerCase()}/${randomUUID()}.${detected}`;
    const contentType = MIME_BY_TYPE[detected];

    await this.storage.put(key, file.buffer, contentType);

    const scanStatus = await this.scanner.scan(file.buffer);
    if (scanStatus === 'INFECTED') {
      await this.storage.remove(key);
      throw new BadRequestException('That file failed a malware check');
    }

    const retentionUntil =
      policy.retentionMonths === null
        ? null
        : new Date(
            new Date().setMonth(new Date().getMonth() + policy.retentionMonths),
          );

    return this.fileRepo.save(
      this.fileRepo.create({
        storageKey: key,
        storageDriver: this.storage.name,
        originalName: file.originalname.slice(0, 255),
        mimeType: contentType,
        sizeBytes: file.size,
        checksumSha256: checksum,
        siteCode,
        purpose,
        scanStatus,
        scannedAt: scanStatus === 'PENDING' ? null : new Date(),
        uploadedBy,
        retentionUntil,
      }),
    );
  }

  /**
   * `siteCode` is optional here, and only here.
   *
   * Admin callers pass their session brand, so one brand cannot reach another's
   * objects. Internal callers — the retention purge, or a gated download that
   * is already scoped by the article it hangs off — omit it deliberately,
   * because they have their own reason to reach a specific row.
   */
  async findById(id: string, siteCode?: number): Promise<StoredFile> {
    const file = await this.fileRepo.findOne({
      where: { id, isDeleted: false, ...(siteCode ? { siteCode } : {}) },
    });
    if (!file) throw new NotFoundException(`File ${id} not found`);
    return file;
  }

  list(siteCode: number, purpose?: FilePurpose): Promise<StoredFile[]> {
    return this.fileRepo.find({
      where: { isDeleted: false, siteCode, ...(purpose ? { purpose } : {}) },
      order: { createdDate: 'DESC' },
    });
  }

  /**
   * A time-limited link to the object.
   *
   * Refuses an unscanned file when `SCAN_REQUIRED` is on. That flag is off by
   * default because no scanner is configured yet — leaving it on would make
   * every upload undownloadable rather than making anything safer.
   */
  /**
   * `siteCode` is required, not optional like it is on findById.
   *
   * This route hands out a signed URL to the object itself, so the id alone
   * must never be enough — it is the one place where knowing a UUID would
   * otherwise cross a brand boundary. Its four siblings on the controller all
   * pass the site; this one did not, which is what made it worth fixing.
   */
  async downloadUrl(
    id: string,
    siteCode: number,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const file = await this.findById(id, siteCode);

    if (file.scanStatus === 'INFECTED') {
      throw new ForbiddenException('That file failed a malware check');
    }
    const scanRequired =
      this.config.get<string>('SCAN_REQUIRED', 'false') === 'true';
    if (scanRequired && file.scanStatus !== 'CLEAN') {
      throw new ForbiddenException(
        'That file has not completed its malware check yet',
      );
    }

    const ttl = parseInt(
      this.config.get<string>('SIGNED_URL_TTL_SECONDS', '300'),
      10,
    );
    const url = await this.storage.signedUrl(file.storageKey, ttl);
    return { url, expiresInSeconds: ttl };
  }

  /** Removes the object as well as the row — the point of a hard delete. */
  async remove(id: string, siteCode?: number): Promise<{ message: string }> {
    const file = await this.findById(id, siteCode);
    await this.storage.remove(file.storageKey);
    await this.fileRepo.delete({ id });
    return { message: 'File deleted from storage and registry' };
  }

  /**
   * Purges everything past its retention date.
   *
   * Intended for a scheduled job. Deletes the object first: a row without an
   * object is a tidy-up problem, an object without a row is a file nobody
   * knows they are still holding.
   */
  async purgeExpired(): Promise<{ purged: number; failed: number }> {
    const due = await this.fileRepo.find({
      where: { isDeleted: false, retentionUntil: LessThanOrEqual(new Date()) },
    });

    let purged = 0;
    let failed = 0;

    for (const file of due) {
      try {
        await this.storage.remove(file.storageKey);
        await this.fileRepo.delete({ id: file.id });
        purged++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Retention purge failed for ${file.storageKey}: ${(error as Error).message}`,
        );
      }
    }

    if (purged || failed) {
      this.logger.log(`Retention purge: ${purged} removed, ${failed} failed`);
    }
    return { purged, failed };
  }
}
