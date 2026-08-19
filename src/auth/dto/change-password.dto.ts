import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Your current password is required' })
  @MaxLength(200)
  currentPassword: string;

  /**
   * Twelve characters, no composition rules. Length is what actually resists an
   * offline attack; forcing a symbol mostly produces `Password1!`.
   */
  @IsString()
  @MinLength(12, { message: 'New password must be at least 12 characters' })
  @MaxLength(200)
  newPassword: string;
}
