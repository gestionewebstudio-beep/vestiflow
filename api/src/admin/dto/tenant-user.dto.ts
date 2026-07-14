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

  /** Ignorato per titolare (sempre true). Per admin: default true se omesso. */
  @IsOptional()
  @IsBoolean()
  readonly hasAllLocationsAccess?: boolean;

  /** Obbligatoria per manager/commesso e per admin con hasAllLocationsAccess=false. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  readonly assignedLocationIds?: string[];

  /**
   * Sede predefinita (suggerimento nei form, mai fallback automatico).
   * Deve essere tra le sedi assegnate; con accesso pieno vale qualunque
   * sede licenziata e attiva del tenant. Facoltativa.
   */
  @IsOptional()
  @IsUUID()
  readonly defaultLocationId?: string | null;

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
  @IsBoolean()
  readonly hasAllLocationsAccess?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  readonly assignedLocationIds?: string[];

  /** Sede predefinita: uuid autorizzato per l'utente, oppure null per azzerarla. */
  @IsOptional()
  @IsUUID()
  readonly defaultLocationId?: string | null;

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
  readonly hasAllLocationsAccess: boolean;
  readonly assignedLocationIds: readonly string[];
  readonly assignedLocations: readonly { readonly id: string; readonly name: string }[];
  /** Sede predefinita (suggerimento nei form); null se non impostata. */
  readonly defaultLocationId: string | null;
  readonly permissions: readonly string[];
  readonly isActive: boolean;
  readonly createdAt: string;
}
