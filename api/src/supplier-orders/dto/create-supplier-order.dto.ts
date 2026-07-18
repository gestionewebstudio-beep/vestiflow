import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
import { PurchaseCostEntryMode } from '@prisma/client';

export class CreateSupplierOrderLineDto {
  @IsUUID()
  variantId!: string;

  /** Snapshot descrizione articolo; se assente il server usa il nome prodotto. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsInt()
  @Min(1)
  orderedQuantity!: number;

  /**
   * Costo unitario digitato in unità minori intere (regole-gestionale: mai
   * float), interpretato netto o ivato secondo costEntryMode di testata.
   */
  @IsInt()
  @Min(0)
  enteredUnitCostMinor!: number;

  /** Sconto riga percentuale intero (0-100). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsUUID()
  vatCodeId?: string;
}

export class CreateSupplierOrderDto {
  @IsUUID()
  supplierId!: string;

  /** Data ordine (testata); default: oggi. */
  @IsOptional()
  @IsISO8601()
  orderDate?: string;

  @IsOptional()
  @IsISO8601()
  expectedAt?: string;

  /** "Rif. ordine fornitore": riferimento libero comunicato dal fornitore. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierReference?: string;

  /** Switch costi netto/ivato (come Arrivo merce). Default: netti. */
  @IsOptional()
  @IsEnum(PurchaseCostEntryMode)
  costEntryMode?: PurchaseCostEntryMode;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateSupplierOrderLineDto)
  lines!: CreateSupplierOrderLineDto[];
}
