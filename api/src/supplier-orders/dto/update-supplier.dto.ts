import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateSupplierDto {  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vatNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxCode?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEmail()
  pec?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  supplierDiscount?: string;

  /** Codice IVA predefinito per documenti di questo fornitore. Null rimuove l'override. */
  @IsOptional()
  @IsUUID()
  defaultVatCodeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  transportResponsible?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  freightTerms?: string;

  /** "Mostra avviso": avviso mostrato alla creazione di documenti per il fornitore. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  documentCreationAlert?: string;

  /** "Inserisci nota": nota inserita automaticamente nei documenti del fornitore. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  documentCreationNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Aggiunge/riattiva (true) o disattiva (false) il ruolo cliente del soggetto. */
  @IsOptional()
  @IsBoolean()
  alsoCustomer?: boolean;
}
