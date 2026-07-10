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

  /** Aliquota IVA in percentuale intera (es. 22). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  vatRatePercent?: number;

  /** Flag "carica magazzino" (§3.2). Default true. */
  @IsOptional()
  @IsBoolean()
  loadsStock?: boolean;

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

export class CreateDocumentDto {
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
  customerId?: string;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DocumentLineInputDto)
  lines?: DocumentLineInputDto[];
}
