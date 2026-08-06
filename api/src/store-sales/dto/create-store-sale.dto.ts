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

/**
 * Pagamento della vendita, una voce per metodo (multi-tender). L'importo è la
 * quota LORDA del totale coperta dal metodo: la somma delle voci deve essere
 * pari al totale documento — la verifica è del servizio, che conosce il totale
 * calcolato dalle righe.
 */
export class StoreSalePaymentInputDto {
  @IsIn(STORE_SALE_PAYMENT_METHODS)
  method!: StoreSalePaymentMethod;

  /** Descrizione libera quando method = 'other' (es. «Assegno», «Buono»). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  methodNote?: string;

  /** Quota del totale coperta da questo metodo (lordo, unità minori intere). */
  @IsInt()
  @Min(1)
  amountMinor!: number;

  /**
   * Solo contanti: importo consegnato dal cliente, se digitato in cassa per
   * calcolare il resto. Mai sotto la quota coperta.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  tenderedMinor?: number;
}

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

  /**
   * Pagamenti per metodo (multi-tender). In alternativa vale il legacy
   * `paymentMethod` a metodo unico: almeno uno dei due deve esserci — la
   * coerenza (somma = totale) la verifica il servizio.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => StoreSalePaymentInputDto)
  payments?: StoreSalePaymentInputDto[];

  /** Legacy a metodo unico: copre l'intero totale. Ignorato se c'è `payments`. */
  @IsOptional()
  @IsIn(STORE_SALE_PAYMENT_METHODS)
  paymentMethod?: StoreSalePaymentMethod;

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
