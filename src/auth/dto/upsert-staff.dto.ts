import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
/**
 * Give an existing employee a way in.
 *
 * It names a person rather than describing one. Who somebody is — their
 * department, designation, joining date — belongs to their employee record and
 * is filed by HR before this is ever called; repeating those fields here would
 * be a second place to get them wrong, and would let an account be created for
 * somebody the company has no record of employing.
 */
export class CreateStaffDto {
  @IsUUID()
  employeeId: string;

  /**
   * Omitted means PENDING — a badge that grants nothing.
   *
   * VIEWER would have been the convenient default and the wrong one: it reads
   * contact enquiries, crane quotes and privacy enquiries, so it would hand
   * over every customer's name and phone number before anyone had decided what
   * this person's job is.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  roleCodes?: number[];

  /**
   * A password chosen by the administrator, set at the moment of creation.
   *
   * Distinct from an invitation, which mints a temporary password nobody chose
   * and mails it. Here somebody types or generates one deliberately and hands
   * it over themselves, so the account is usable immediately and no credential
   * sits in an inbox waiting to be found.
   *
   * Required, and it was not always. Leaving it out created an account with no
   * way in — a half-made thing that looked finished in the staff list and
   * could only be completed by remembering to invite it afterwards. Granting
   * access is now one act: an account exists when somebody can use it.
   *
   * Re-issuing a credential later remains the invitation's job.
   */
  @IsString({ message: 'Set a password for this account' })
  @MinLength(12, { message: 'A password must be at least 12 characters' })
  @MaxLength(200)
  password: string;

  /** Only meaningful alongside `password`; ignored without one. */
  @IsOptional()
  @IsBoolean()
  sendPasswordEmail?: boolean;

  // No siteCode. The account is created on the dashboard the caller is signed
  // in to, taken from the token — it could never legitimately be anything
  // else. Further brands are granted afterwards, one badge at a time.
}

/**
 * The account, and only the account.
 *
 * Name, department, designation and the rest live on the employee now and are
 * edited through the HR module. What is left here is what an account actually
 * has: whether it may be used.
 *
 * `fullName` stays because `admins` still carries one for display on the
 * sign-in and audit paths, which must not have to join a second table.
 */
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

/**
 * Set an existing account's password to one an administrator chose.
 *
 * Deliberately separate from `reset-password`, which mints a random
 * temporary credential and forces a change at next sign-in. This one is the
 * opposite bargain: the administrator picks the password, hands it over
 * themselves, and the holder is not made to change it. Both end every session,
 * because a changed password must not leave old ones open.
 */
export class SetPasswordDto {
  @IsString()
  @MinLength(12, { message: 'A password must be at least 12 characters' })
  @MaxLength(200)
  password: string;

  /** Send the new password to the account's own address. */
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}

/**
 * What a role may do on this dashboard.
 *
 * The complete set, not a delta — a save replaces the role's permissions here,
 * so a permission left out is one being taken away. Sending differences would
 * mean the client and the server each holding half of the answer, and the
 * screen this comes from renders the whole grid anyway.
 *
 * The site is not in the body: a role's meaning can only be changed on the
 * dashboard the caller is signed in to.
 */
export class SetRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RoleGrantDto)
  grants: RoleGrantDto[];
}

export class RoleGrantDto {
  @IsInt()
  featureCode: number;

  @IsInt()
  permissionCode: number;
}
