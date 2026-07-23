import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AdjustmentDirection, DocumentType } from '@prisma/client';

import { DocumentAddressDto, DocumentTransportFieldsDto } from './document-transport.dto';

/** Riga documento in input. La testata calcola i totali server-side. */
export class DocumentLineInputDto {
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @IsString()
  @Length(1, 300)
  description!: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  /** LEGACY: aliquota IVA in percentuale intera (es. 22). Sostituita da vatCodeId. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  vatRatePercent?: number;

  /** Codice IVA della riga. Se assente, risolto da articolo/fornitore/tenant. */
  @IsOptional()
  @IsUUID()
  vatCodeId?: string;

  /** Flag "carica magazzino" (§3.2). Default true. */
  @IsOptional()
  @IsBoolean()
  loadsStock?: boolean;

  /** Riga «documento collegato»: separatore informativo, fuori dai totali. */
  @IsOptional()
  @IsBoolean()
  isReference?: boolean;

  /** Riga ordine fornitore collegata (§10.1). */
  @IsOptional()
  @IsUUID()
  supplierOrderLineId?: string;

  /** Codice lotto (tracciamento lot, opzionale). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lotCode?: string;

  /** Data scadenza lotto (ISO 8601 date). */
  @IsOptional()
  @IsISO8601()
  lotExpiryDate?: string;

  /** Numeri seriali (tracciamento serial, opzionale). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @ArrayMaxSize(500)
  serialNumbers?: string[];
}

export class CreateDocumentDto extends DocumentTransportFieldsDto {
  @IsEnum(DocumentType)
  type!: DocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  /**
   * Numero imposto dalla testata: assente = primo libero della serie assegnato
   * alla conferma. Un numero imposto non sposta il progressivo.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  number?: number;

  @IsISO8601()
  documentDate!: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  /**
   * Cliente a testo libero (prompt Scarico manuale): usato SOLO quando
   * customerId è assente — snapshot per la stampa, mai salvato in anagrafica.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  targetLocationId?: string;

  /** Direzione rettifica inventario (solo tipo adjustment). */
  @IsOptional()
  @IsEnum(AdjustmentDirection)
  adjustmentDirection?: AdjustmentDirection;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalComment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalDocNumber?: string;

  @IsOptional()
  @IsISO8601()
  externalDocDate?: string;

  @IsOptional()
  @IsUUID()
  sourceDocumentId?: string;

  @IsOptional()
  @IsUUID()
  supplierOrderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingCause?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalRef?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  documentDiscountPercent?: number;

  /** Condizioni di pagamento in testata (Preventivo: campo «Pagamento»). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  paymentTerms?: string;

  /** Modalità di pagamento (DDT vendita: voce normativa MP01–MP23, snapshot nome). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentMethod?: string;

  /** Data prevista consegna (Preventivo: campo «Consegna prevista»). */
  @IsOptional()
  @IsISO8601()
  expectedDeliveryDate?: string;

  /** Scadenza pagamento (Fattura). */
  @IsOptional()
  @IsISO8601()
  paymentDueDate?: string;

  /** IBAN di incasso: precompilato da Impostazioni, modificabile qui. */
  @IsOptional()
  @IsString()
  @MaxLength(34)
  iban?: string;

  /**
   * DDT vendita agganciati alla fattura («Riferimento DDT», opzionale).
   * Collegamento solo documentale: non muove magazzino, ma la sua presenza
   * sopprime lo scarico della Fattura accompagnatoria, perché le giacenze
   * sono già scese col DDT.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  linkedSalesDdtIds?: string[];

  /** "Seguirà doc. di vendita" (DDT vendita, prompt DDT §TESTATA). */
  @IsOptional()
  @IsBoolean()
  followedBySalesDoc?: boolean;

  /** Intestatario documento (snapshot indirizzo, prompt DDT §INDIRIZZI). */
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentAddressDto)
  recipientAddress?: DocumentAddressDto;

  /** Destinazione merce (può differire dall'intestatario). */
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentAddressDto)
  destinationAddress?: DocumentAddressDto;

  /**
   * Ordini cliente inclusi nel DDT vendita («Includi documento»): vengono
   * agganciati al documento, gli impegni rilasciati e lo stato aggiornato
   * alla conferma (prompt DDT §LOGICA MAGAZZINO).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  includedSalesOrderIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DocumentLineInputDto)
  lines?: DocumentLineInputDto[];
}
