import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
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

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  ownerPassword!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  storeName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  locationName?: string;
}
