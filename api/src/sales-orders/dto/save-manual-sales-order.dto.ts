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
  Max,
  MaxLength,
  Min,
  ValidateNested,
  IsNumber,
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
  // ⚠️ NON `@IsInt()`: in modalità ivata il client manda il netto SCORPORATO,
  //   che ha la coda decimale per contratto («2049,180328»), e la colonna
  //   `sales_order_lines.unit_price_minor` è `numeric(16,6)` — verificato.
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
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

  /** Riga «documento collegato»: separatore informativo, fuori dai totali. */
  @IsOptional()
  @IsBoolean()
  isReference?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitOfMeasure?: string;

  /**
   * Etichetta della variante («M / Rosso») da fotografare sulla riga.
   *
   * ⚠️ Serve alla DUPLICAZIONE, che deve riportare quella dell'ordine origine
   * invece di ricomporla: se la variante nel frattempo è uscita dal catalogo,
   * ricomporla darebbe stringa vuota e il duplicato perderebbe l'informazione.
   *
   * ⛔ Vale SOLO sulle righe nuove. Su una riga già esistente che porta ancora
   * la stessa variante il server conserva il valore persistito e ignora questo
   * campo: la fotografia non la decide chi chiama.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  variantLabel?: string;
}

/**
 * Salvataggio unico Ordine cliente manuale: testata + righe + totali +
 * impegni magazzino in un'unica transazione (stessa impostazione del
 * "Salva documento" dell'Arrivo merce). `id` assente = creazione.
 * Non esiste stato Bozza: o Confermato, o non esiste (§STATI).
 */
export class SaveManualSalesOrderDto {
  /**
   * Serie del numeratore. Assente = la serie predefinita del tipo.
   *
   * Fino al 12/08/2026 il client non poteva sceglierla: il campo Numero+Serie
   * era nascosto proprio sull'Ordine cliente (`@if (!isOrder)`), il server
   * prendeva sempre la predefinita, e l'unico documento di Categoria A a non
   * mostrare la propria numerazione era quello.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  /**
   * Numero imposto dalla testata. Assente = lo assegna il server, primo libero
   * della serie. Se è già occupato risponde 409 col conflitto, come gli altri
   * documenti.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  number?: number;

  @IsOptional()
  @IsUUID()
  id?: string;

  /**
   * Modalità con cui i prezzi sono stati DIGITATI su questo ordine: netti
   * (assente o `false`) o ivati. Il client manda comunque il NETTO in
   * `unitPriceMinor` — questo campo dice soltanto come quel netto va rimostrato,
   * ed è una proprietà dell'ordine, non di chi lo apre.
   */
  @IsOptional()
  @IsBoolean()
  pricesIncludeVat?: boolean;

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

  /**
   * Stato del ciclo commerciale, scelto dall'operatore.
   *
   * ⭐ **`confirmed` resta il default**: chi crea normalmente un ordine non deve
   * fare un passaggio in più perché è stato introdotto un quarto stato
   * (`18` §2.4-bis). «Da confermare» è una scelta esplicita.
   *
   * ⛔ **`concluded` NON è accettato**, e non per dimenticanza: è derivato dal
   * collegamento a un documento conclusivo. Un valore scelto verrebbe
   * sovrascritto al primo ricalcolo, e nel frattempo mentirebbe. Lo rifiuta
   * anche `assertManualTransition`, che è l'autorità.
   */
  @IsOptional()
  @IsIn(['to_confirm', 'confirmed', 'cancelled'])
  status?: 'to_confirm' | 'confirmed' | 'cancelled';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /**
   * Nota interna, mai in stampa.
   *
   * ⭐ Aggiunta il 25/08/2026: l'ordine cliente ne era privo solo perche' la
   * colonna non esisteva su `sales_orders`, non per una ragione funzionale.
   * Stesso limite delle note pubbliche — sono lo stesso genere di testo.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalComment?: string;

  /** Condizioni di pagamento (proposta dall'anagrafica cliente, non vincolo). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentTerms?: string;

  /** Sconto extra % sull'intero documento, dopo gli sconti riga (come Arrivo merce). */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  documentDiscountPercent?: number;

  /** Righe opzionali: un ordine può esistere con la sola testata compilata. */
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SaveManualSalesOrderLineDto)
  lines!: SaveManualSalesOrderLineDto[];
  // ⚠️ Qui stavano i tre campi del «documento della controparte»
  // (`externalDocNumber`, `externalDocDate`, `externalDocumentTypeId`).
  // Tolti il 12/08/2026 insieme al blocco in testata: questo documento non ne
  // ha uno da citare. Chiudere anche l'ingresso serve — finché il DTO li
  // accetta, un client può scriverli e le colonne tornano a riempirsi di dati
  // che nessuna maschera mostra. Le colonne restano: toglierle è distruttivo su
  // database condiviso e aspetta la finestra concordata.
}
