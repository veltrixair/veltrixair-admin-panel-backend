import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateStaffDto {
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(2, { message: 'Full name is required' })
  @MaxLength(150)
  fullName: string;

  /**
   * At least one role. An account with none can sign in and then be refused by
   * every route it touches, which reads like a bug rather than a decision.
   */
  @IsArray()
  @ArrayNotEmpty({ message: 'Assign at least one role' })
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  roleCodes: number[];

  // No siteCode. The account is created on the dashboard the caller is
  // signed in to, taken from the token — it could never legitimately be
  // anything else, so asking for it only creates a field the UI can get
  // wrong. Further brands are granted afterwards, one badge at a time.
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Grant one badge — what an "Assign role" button sends.
 *
 * The dashboard comes from the token, not the body: you can only grant on
 * the one you are signed in to.
 */
export class AssignRoleDto {
  @IsInt()
  roleCode: number;
}

/**
 * Replace the role set for **one brand** — what a checkbox form sends on save.
 *
 * Scoped to a site so a save on the cranes screen cannot silently strip
 * someone's IT access just because those boxes weren't on the page.
 */
export class ReplaceRolesDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Send at least one role for this dashboard' })
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  roleCodes: number[];
}
