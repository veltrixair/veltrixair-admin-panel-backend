import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { SpamCheckService } from '../common/services/spam-check.service';
import { GatedDownloadDto } from './dto/gated-download.dto';
import { AssetDownloadRequest } from './entities/asset-download-request.entity';
import { FilesService } from './files.service';

export interface DownloadContext {
  ip?: string;
  userAgent?: string;
}

export interface GatedDownloadResult {
  url: string;
  expiresInSeconds: number;
  fileName: string;
  sizeBytes: number;
}

/**
 * Capture-then-sign, shared by whitepapers and the capability statement.
 *
 * The lead is recorded before the link is issued, so a download always leaves a
 * trace even if the visitor never returns. Suspected spam is stored rather than
 * refused, for the same reason as the contact form: a false positive must not
 * turn a real prospect away.
 */
@Injectable()
export class GatedDownloadService {
  constructor(
    @InjectRepository(AssetDownloadRequest)
    private readonly requestRepo: Repository<AssetDownloadRequest>,
    private readonly filesService: FilesService,
    private readonly spamCheck: SpamCheckService,
    private readonly config: ConfigService,
  ) {}

  async requestDownload(
    fileId: string,
    context: string | null,
    dto: GatedDownloadDto,
    meta: DownloadContext,
    siteCode: number,
  ): Promise<GatedDownloadResult> {
    // Fails early if the file is missing, infected, or unscanned while
    // SCAN_REQUIRED is on — no point recording a lead for a link we cannot give.
    const file = await this.filesService.findById(fileId, siteCode);
    const link = await this.filesService.downloadUrl(fileId, siteCode);

    const spam = await this.spamCheck.evaluate({
      honeypot: dto.website,
      captchaToken: dto.captchaToken,
      email: dto.workEmail,
      ip: meta.ip,
    });

    await this.requestRepo.save(
      this.requestRepo.create({
        fileId,
        siteCode,
        context,
        fullName: dto.fullName,
        company: dto.company,
        roleTitle: dto.roleTitle ?? null,
        workEmail: dto.workEmail,
        consentAt: new Date(),
        privacyNoticeVersion: this.config.getOrThrow<string>(
          'PRIVACY_NOTICE_VERSION',
        ),
        sourcePage: dto.sourcePage ?? null,
        utmSource: dto.utmSource ?? null,
        utmMedium: dto.utmMedium ?? null,
        utmCampaign: dto.utmCampaign ?? null,
        ipHash: this.spamCheck.hashIp(meta.ip),
        userAgent: meta.userAgent ?? null,
        spamScore: spam.score,
      }),
    );

    return {
      url: link.url,
      expiresInSeconds: link.expiresInSeconds,
      fileName: file.originalName,
      sizeBytes: file.sizeBytes,
    };
  }

  async list(
    siteCode: number,
    page = 1,
    limit = 20,
    fileId?: string,
  ): Promise<PaginatedResult<AssetDownloadRequest>> {
    const [items, total] = await this.requestRepo.findAndCount({
      where: fileId ? { fileId, siteCode } : { siteCode },
      relations: { file: true },
      order: { createdDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
