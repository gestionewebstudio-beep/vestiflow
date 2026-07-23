import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { DocumentAddressDto } from './document-transport.dto';

/**
 * Riga manuale della registrazione (voci non legate ad arrivi merce):
 * descrizione + importo netto + aliquota + importo IVA.
 */
export class PurchaseInvoiceManualLineDto {
  @IsString()
  @MaxLength(500)
  description!: string;

  @IsInt()
  netMinor!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  vatRatePercent!: number;

  @IsInt()
  vatMinor!: number;
}

/** Scadenza di pagamento: data, importo, saldato e data saldo. */
export class PurchaseInvoiceInstallmentDto {
  @IsISO8601()
  dueDate!: string;

  @IsInt()
  @Min(0)
  amountMinor!: number;

  @IsOptional()
  @IsBoolean()
  settled?: boolean;

  @IsOptional()
  @IsISO8601()
  settledAt?: string;
}

/**
 * Registrazione fattura fornitore (prompt §5-6): documento contabile che NON
 * movimenta il magazzino. Gli arrivi merce inclusi generano righe raggruppate
 * per aliquota IVA; le righe manuali coprono voci non legate ad arrivi.
 */
export class SavePurchaseInvoiceDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  supplierId!: string;

  /** Numero interno imposto dalla testata; assente = primo libero della serie. */
  @IsOptional()
  @IsInt()
  @Min(1)
  number?: number;

  /** Data documento: la data della fattura ricevuta dal fornitore. */
  @IsISO8601()
  documentDate!: string;

  /** Data registrazione interna (default oggi, modificabile). */
  @IsOptional()
  @IsISO8601()
  registrationDate?: string;

  /** Numero della fattura ricevuta dal fornitore. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalDocNumber?: string;

  /** Data della fattura ricevuta dal fornitore (legacy: ora coincide con documentDate). */
  @IsOptional()
  @IsISO8601()
  externalDocDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalComment?: string;

  /** Tipo pagamento (auto-compilato dall'anagrafica fornitore, modificabile). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentMethod?: string;

  /** Indirizzi: snapshot anagrafica fornitore, modificabile per eccezioni. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentAddressDto)
  recipientAddress?: DocumentAddressDto;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /**
   * Totali legacy: usati SOLO se la registrazione non ha né arrivi inclusi né
   * righe manuali (compatibilità con vecchi client). Altrimenti i totali sono
   * sempre ricalcolati dalle righe.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  totalMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  subtotalMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  taxMinor?: number;

  /** Arrivi merce inclusi ("Includi arrivo merce", §5.1). */
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(200)
  goodsReceiptIds?: string[];

  /** Righe manuali per voci non legate ad arrivi merce. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceManualLineDto)
  @ArrayMaxSize(100)
  manualLines?: PurchaseInvoiceManualLineDto[];

  /** Scadenze di pagamento (lista sostituita integralmente a ogni salvataggio). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceInstallmentDto)
  @ArrayMaxSize(60)
  installments?: PurchaseInvoiceInstallmentDto[];
}
