import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TenantChannelProfile, UserRole } from '@prisma/client';

import { TenantProfileFieldsDto } from './tenant-profile-fields.dto';

function trimToUndefined({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class CreateTenantDto extends TenantProfileFieldsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  tenantName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerDisplayName!: string;

  @IsEmail()
  @MaxLength(255)
  ownerEmail!: string;

  /** Obbligatoria se SUPABASE_OWNER_EMAIL_INVITE non è true (default). */
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  ownerPassword?: string;

  @IsOptional()
  @IsEnum(TenantChannelProfile)
  channelProfile?: TenantChannelProfile;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(trimToUndefined)
  storeName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(trimToUndefined)
  locationName?: string;
}
