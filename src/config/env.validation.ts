import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Every variable the app needs in order to boot. Anything missing or malformed
 * fails the process at startup rather than surfacing as a runtime error later.
 */
class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv;

  @IsNumberString()
  PORT: string;

  // --- Database ---
  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @IsNumberString()
  DB_PORT: string;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME: string;

  @IsOptional()
  @IsBooleanString()
  DB_SSL?: string;

  // --- HTTP ---
  /** Comma-separated list of allowed browser origins. */
  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS: string;

  // --- Rate limiting ---
  @IsOptional()
  @IsNumberString()
  THROTTLE_TTL?: string;

  @IsOptional()
  @IsNumberString()
  THROTTLE_LIMIT?: string;

  // --- Privacy / consent ---
  /** Recorded verbatim on every consent so you can prove what was agreed to. */
  @IsString()
  @IsNotEmpty()
  PRIVACY_NOTICE_VERSION: string;

  /**
   * HMAC pepper for hashing submitter IPs. Never store raw addresses.
   *
   * IPv4 is only ~4 billion values, so the pepper is the only thing making
   * those hashes irreversible — a weak one is equivalent to storing raw IPs.
   * Must never be rotated once live: every stored hash becomes unmatchable.
   */
  @IsString()
  @MinLength(32, {
    message:
      "IP_PEPPER must be at least 32 characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  })
  IP_PEPPER: string;

  // --- Mail ---
  @IsString()
  @IsNotEmpty()
  MAIL_FROM: string;

  // --- Anti-spam ---
  /** Optional: when unset, Turnstile verification is skipped (local dev). */
  @IsOptional()
  @IsString()
  TURNSTILE_SECRET?: string;

  // --- Admin authentication ---
  /**
   * Signing key for staff access tokens. Anyone holding it can mint a token for
   * any admin, so it is the single most sensitive value in the file — 32
   * characters is the floor, not a target.
   */
  @IsString()
  @MinLength(32, {
    message:
      "ADMIN_JWT_SECRET must be at least 32 characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
  })
  ADMIN_JWT_SECRET: string;

  /** Access token lifetime, e.g. `15m`. Short by design — refresh covers the gap. */
  @IsOptional()
  @IsString()
  ADMIN_ACCESS_TOKEN_TTL?: string;

  /** Refresh token lifetime in days. */
  @IsOptional()
  @IsNumberString()
  ADMIN_REFRESH_TOKEN_TTL_DAYS?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map(
        (error) =>
          `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  // Return the original object so ConfigService still sees every variable,
  // including the ones not declared above.
  return config;
}
