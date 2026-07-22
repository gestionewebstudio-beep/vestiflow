import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
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
import { DocumentType } from '@prisma/client';

/**
 * Nuova anagrafica da creare atomicamente con la riga (punto A): quando la
 * riga non ha `variantId` ma porta `newProduct`, Product + variante tecnica
 * nascono NELLA STESSA transazione del documento e dei movimenti. Il solo
 * nome è sufficiente (SKU facoltativo, specifica cliente §SKU); omonimi
 * ammessi (ID diverso). Con quantità 0 al salvataggio esplicito si crea la
 * sola anagrafica, senza riga documento.
 */
export class SaveGoodsReceiptNewProductDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sellingPriceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  compareAtPriceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  purchasePriceMinor?: number;

  /** Codice IVA predefinito del nuovo articolo (validato per tenant). */
  @IsOptional()
  @IsUUID()
  vatCodeId?: string;

  /** False = articolo non gestito a magazzino: la riga resta solo economica (punto B). */
  @IsOptional()
  @IsBoolean()
  managesStock?: boolean;

  /** Unità di misura del nuovo articolo (es. pz, kg); assente = default pz. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitOfMeasure?: string;
}

/**
 * Riga Arrivo merce in salvataggio. L'id è presente per le righe già salvate:
 * preservarlo è essenziale per aggiornare il movimento collegato invece di
 * crearne uno nuovo (prompt §2.3 casi B/C).
 */
export class SaveGoodsReceiptLineDto {
  @IsOptional()
  @IsUUID()
  id?: string;

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

  /** LEGACY: aliquota % intera. Usare vatCodeId; accettata come fallback. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  vatRatePercent?: number;

  /** Codice IVA della riga (tabella vat_codes, §9). */
  @IsOptional()
  @IsUUID()
  vatCodeId?: string;

  /**
   * Costo unitario digitato in unità minori: netto o ivato secondo la
   * modalità documento (§11.4). Se assente si usa unitPriceMinor come netto.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  enteredUnitCostMinor?: number;

  @IsOptional()
  @IsBoolean()
  loadsStock?: boolean;

  @IsOptional()
  @IsUUID()
  supplierOrderLineId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lotCode?: string;

  @IsOptional()
  @IsISO8601()
  lotExpiryDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @ArrayMaxSize(500)
  serialNumbers?: string[];

  /** Creazione atomica articolo+riga (punto A): solo per righe senza variantId. */
  @IsOptional()
  @ValidateNested()
  @Type(() => SaveGoodsReceiptNewProductDto)
  newProduct?: SaveGoodsReceiptNewProductDto;
}

/**
 * Salvataggio unico Arrivo merce (prompt §2.1): testata + righe + totali +
 * movimenti + giacenze in un'unica operazione. `id` assente = creazione.
 */
export class SaveGoodsReceiptDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsEnum(DocumentType)
  type!: DocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  @IsISO8601()
  documentDate!: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** Causale di carico, es. "DDT 145 del 08/05/2026" (prompt §1.2). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  causalText?: string;

  /** Modalità causale: auto = generata dal modello, manual = testo utente (§10). */
  @IsOptional()
  @IsIn(['auto', 'manual'])
  causalGenerationMode?: 'auto' | 'manual';

  /** Modello causale usato in modalità auto (snapshot, §13). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  causalTemplateSnapshot?: string;

  /** Tipo documento fornitore (tabella per tenant, §3-4). */
  @IsOptional()
  @IsUUID()
  externalDocumentTypeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalDocNumber?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingCause?: string;

  /** Modalità di pagamento (precompilata dal fornitore, modificabile). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentMethod?: string;

  @IsOptional()
  @IsUUID()
  supplierOrderId?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  documentDiscountPercent?: number;

  /** Modalità costi del documento: netti o ivati (§11.1). */
  @IsOptional()
  @IsIn(['vat_excluded', 'vat_included'])
  purchaseCostEntryMode?: 'vat_excluded' | 'vat_included';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SaveGoodsReceiptLineDto)
  lines?: SaveGoodsReceiptLineDto[];

  /** Politica prezzi fornitore quando updateSupplierPriceOnLoad = ask. */
  @IsOptional()
  @IsBoolean()
  applySupplierPriceUpdates?: boolean;
}
