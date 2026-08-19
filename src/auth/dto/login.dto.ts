import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  // Normalised here as well as in the service, so a trailing space typed into
  // a login form doesn't fail @IsEmail before it ever reaches the lookup.
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email: string;

  /**
   * Only a length floor is enforced here. Complexity rules belong where a
   * password is *set*, not where it is checked — rejecting a login for a weak
   * password tells an attacker something about the account.
   */
  @IsString()
  @MinLength(1, { message: 'Password is required' })
  @MaxLength(200)
  password: string;

  /**
   * Which dashboard was picked on the sign-in screen.
   *
   * The session is scoped to it, so there is no in-app brand switcher and no
   * site header for a client to tamper with. Working two brands means two
   * sign-ins.
   */
  @Type(() => Number)
  @IsInt({ message: 'Choose a dashboard to sign in to' })
  siteCode: number;

  /**
   * Which role to act as. Must be one the account already holds on that site —
   * this narrows a session, it never grants anything.
   */
  @Type(() => Number)
  @IsInt({ message: 'Choose a role to sign in as' })
  roleCode: number;
}
