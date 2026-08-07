import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { TAX_REGIME_CODES, type TaxRegimeCode } from '../../tenant/tax-regime.constant';

function trimToUndefined({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Campi anagrafici opzionali del tenant (cliente VestiFlow). */
export class TenantProfileFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(trimToUndefined)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^\d{11}$/, { message: 'Partita IVA non valida: servono 11 cifre' })
  @Transform(trimToUndefined)
  vatNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(trimToUndefined)
  fiscalCode?: string;

  /** Regime fiscale FatturaPA (RF01–RF19): alimenta RegimeFiscale nell'XML. */
  @IsOptional()
  @IsIn(TAX_REGIME_CODES, { message: 'Regime fiscale non valido: usa un codice RF01–RF19' })
  @Transform(trimToUndefined)
  taxRegime?: TaxRegimeCode;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(trimToUndefined)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  @Transform(trimToUndefined)
  pec?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Transform(trimToUndefined)
  sdiCode?: string;

  /** IBAN di incasso: 34 caratteri è il massimo previsto dallo standard. */
  @IsOptional()
  @IsString()
  @MaxLength(34)
  @Transform(trimToUndefined)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimToUndefined)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimToUndefined)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trimToUndefined)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trimToUndefined)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(trimToUndefined)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  @Transform(trimToUndefined)
  countryCode?: string;
}
