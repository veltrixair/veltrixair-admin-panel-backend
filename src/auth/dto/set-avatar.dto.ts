import { IsOptional, IsUUID } from 'class-validator';

/**
 * Point the account at an already-uploaded photo.
 *
 * A file id, not the bytes. The upload endpoint enforces size, format and
 * magic-byte checks for the PROFILE_PHOTO purpose; repeating those rules here
 * would be a second place to keep them in step.
 *
 * Null clears it, which is the same act as removing — so DELETE and a null
 * here land in one code path rather than two that could drift.
 */
export class SetAvatarDto {
  @IsOptional()
  @IsUUID()
  fileId: string | null = null;
}
