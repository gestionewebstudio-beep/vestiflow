import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateTenantUserDto {
  @IsEmail()
  @MaxLength(255)
  readonly email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  readonly password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  readonly displayName!: string;

  @IsEnum(UserRole)
  readonly role!: UserRole;

  /** Obbligatoria per manager/commesso se esistono sedi attive. */
  @IsOptional()
  @IsUUID()
  readonly assignedLocationId?: string;

  /** Ignorato per titolare (accesso pieno). Default = preset del ruolo se omesso. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  readonly permissions?: readonly string[];
}

export class UpdateTenantUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  readonly displayName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  readonly role?: UserRole;

  @IsOptional()
  @IsUUID()
  readonly assignedLocationId?: string | null;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  readonly permissions?: readonly string[];
}

export interface TenantUserDto {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly assignedLocationId: string | null;
  readonly assignedLocationName: string | null;
  readonly permissions: readonly string[];
  readonly isActive: boolean;
  readonly createdAt: string;
}
