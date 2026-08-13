import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

function trimToUndefined({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * I campi anagrafici di un'azienda italiana: ragione sociale, identificativi
 * fiscali, sede, contatti.
 *
 * Li condividono due anagrafiche che restano **distinte** (decisione di
 * prodotto 08/2026): quella del cliente VestiFlow, che compila l'admin di
 * piattaforma all'attivazione, e quella dell'azienda gestita nel gestionale,
 * che compila il titolare e che intesta i documenti. Uguali sono le regole di
 * validazione — una partita IVA ha undici cifre in entrambi i casi — non i
 * dati: per questo la forma sta qui e i due DTO la estendono.
 */
export class CompanyFieldsDto {
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
