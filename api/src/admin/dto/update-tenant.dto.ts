import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { TenantChannelProfile } from '@prisma/client';

import {
  TENANT_LICENSED_LOCATION_MAX,
  TENANT_LICENSED_LOCATION_MIN,
} from '../../common/tenant-location-license.constants';
import { TenantProfileFieldsDto } from './tenant-profile-fields.dto';

function trimToUndefined({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class UpdateTenantDto extends TenantProfileFieldsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(trimToUndefined)
  tenantName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(trimToUndefined)
  ownerDisplayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(trimToUndefined)
  storeName?: string;

  @IsOptional()
  @IsEnum(TenantChannelProfile)
  channelProfile?: TenantChannelProfile;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(trimToUndefined)
  locationName?: string;

  /** Sedi operative incluse nel contratto (1–10). */
  @IsOptional()
  @IsInt()
  @Min(TENANT_LICENSED_LOCATION_MIN)
  @Max(TENANT_LICENSED_LOCATION_MAX)
  licensedLocationCount?: number;
}
