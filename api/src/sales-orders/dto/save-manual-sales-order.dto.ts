import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Riga Ordine cliente manuale in salvataggio. L'id è presente per le righe
 * già salvate: preservarlo mantiene l'idempotenza degli impegni (una sola
 * StockReservation per riga, aggiornata invece che ricreata — stesso
 * principio di persistenza dell'Arrivo merce).
 */
export class SaveManualSalesOrderLineDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string;

  /** Nome prodotto snapshot (display stabile anche se il catalogo cambia). */
  @IsString()
  @Length(1, 300)
  title!: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceMinor?: number;

  /** Sconto riga in notazione a cascata: "10%", "4+10%", "2+5+8%". */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  discount?: string;

  /** Codice IVA della riga (tabella Codici IVA in Impostazioni). */
  @IsOptional()
  @IsUUID()
  vatCodeId?: string;

  /** Spunta "Impegna magazzino" (default dal Tipo prodotto, sempre modificabile). */
  @IsOptional()
  @IsBoolean()
  commitsStock?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitOfMeasure?: string;
}

/**
 * Salvataggio unico Ordine cliente manuale: testata + righe + totali +
 * impegni magazzino in un'unica transazione (stessa impostazione del
 * "Salva documento" dell'Arrivo merce). `id` assente = creazione.
 * Non esiste stato Bozza: o Confermato, o non esiste (§STATI).
 */
export class SaveManualSalesOrderDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsISO8601()
  documentDate!: string;

  /** Rif. ordine cliente esterno (testo libero). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalRef?: string;

  @IsOptional()
  @IsISO8601()
  expectedDeliveryDate?: string;

  /** Stato documento: Confermato (default) o Annullato. Concluso solo via "Concludi ordine". */
  @IsOptional()
  @IsIn(['confirmed', 'cancelled'])
  status?: 'confirmed' | 'cancelled';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Condizioni di pagamento (proposta dall'anagrafica cliente, non vincolo). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentTerms?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SaveManualSalesOrderLineDto)
  lines!: SaveManualSalesOrderLineDto[];
}
