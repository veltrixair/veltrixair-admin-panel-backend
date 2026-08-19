import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @MinLength(20, { message: 'A refresh token is required' })
  @MaxLength(200)
  refreshToken: string;
}
