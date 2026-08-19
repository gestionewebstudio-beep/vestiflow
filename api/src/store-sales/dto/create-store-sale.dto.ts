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
  /**
   * Id della riga quando si RISALVA una vendita esistente. Assente = riga nuova.
   *
   * ⚠️ E' l'identita' su cui si regge la riconciliazione per differenza: il
   * movimento e' collegato alla riga via `sourceLineId`, e senza id stabile
   * ogni salvataggio ne accoderebbe uno nuovo invece di aggiornare quello che
   * c'e' (`regole-gestionale`, «un movimento per riga, aggiornato in posto»).
   *
   * ⛔ Non si riconoscono le righe per `variantId`: due righe dello stesso
   * articolo sono due righe, e restano due movimenti distinti.
   */
  @IsOptional()
  @IsUUID()
  id?: string;

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

  /**
   * Descrizione della riga, quando l'operatore la cambia.
   *
   * ⚠️ **Assente = non modificata**, e il servizio conserva quella persistita
   * (o la fotografa dall'articolo se la riga è nuova). È lo stesso contratto
   * binario del Codice IVA, e per la stessa ragione: la descrizione è la
   * **fotografia** dell'operazione, e rileggerla dall'anagrafica a ogni
   * salvataggio riscriverebbe una vendita di marzo col nome di oggi.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Codice IVA della riga. Se assente, risolto da articolo/predefinito aziendale. */
  @IsOptional()
  @IsUUID()
  vatCodeId?: string;
}

export class CreateStoreSaleDto {
  /**
   * Id della vendita da RISALVARE. Assente = vendita nuova.
   *
   * Creazione e modifica dallo stesso metodo, distinte solo da questo campo:
   * e' la forma gia' in uso per l'Arrivo merce (`saveGoodsReceipt`), l'unico
   * altro documento che sta fuori dal percorso generico e si modifica lo stesso.
   */
  @IsOptional()
  @IsUUID()
  id?: string;

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
