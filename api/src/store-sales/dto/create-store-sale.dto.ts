import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
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

  /**
   * Prezzo unitario applicato in cassa, NETTO in unità minori: al banco si vede
   * e si digita l'ivato, ma quello che arriva qui è già scorporato.
   *
   * Non intero (§sei decimali): lo scorporo lascia una coda decimale — fino a 4
   * cifre di centesimo, quante ne tiene la colonna — ed è quella a far tornare
   * il prezzo digitato quando la riga viene rimostrata ivata.
   */
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  unitPriceMinor!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  /** Codice IVA della riga. Se assente, risolto da articolo/predefinito aziendale. */
  @IsOptional()
  @IsUUID()
  vatCodeId?: string;
}

export class CreateStoreSaleDto {
  @IsUUID()
  locationId!: string;

  @IsIn(STORE_SALE_PAYMENT_METHODS)
  paymentMethod!: StoreSalePaymentMethod;

  /**
   * Descrizione libera quando paymentMethod = 'other' (es. «Assegno»). Il
   * codice resta 'other' per il filtro dell'elenco; questo testo si mostra
   * accanto ad «Altro». Ignorato per cash/card.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentMethodNote?: string;

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
