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
import { DocumentType } from '@prisma/client';

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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  vatRatePercent?: number;

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

  /** Tipo riferimento documento fornitore: DDT, Fattura, Reso, Altro (§9.3). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  supplierRefType?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalRef?: string;

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
