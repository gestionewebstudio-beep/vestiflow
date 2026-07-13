import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const STORE_SALE_PAYMENT_METHODS = ['cash', 'card', 'other'] as const;
export type StoreSalePaymentMethod = (typeof STORE_SALE_PAYMENT_METHODS)[number];

/** Riga carrello Vendita in negozio (fase 3 §7). */
export class StoreSaleLineInputDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /** Prezzo unitario applicato in cassa (unità minori, IVA inclusa). */
  @IsInt()
  @Min(0)
  unitPriceMinor!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  /** Aliquota IVA % intera (per scorporo interno); opzionale. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  vatRatePercent?: number;
}

export class CreateStoreSaleDto {
  @IsUUID()
  locationId!: string;

  @IsIn(STORE_SALE_PAYMENT_METHODS)
  paymentMethod!: StoreSalePaymentMethod;

  /** Cliente opzionale: la vendita immediata non lo richiede (§7). */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsISO8601()
  documentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => StoreSaleLineInputDto)
  lines!: StoreSaleLineInputDto[];
}
