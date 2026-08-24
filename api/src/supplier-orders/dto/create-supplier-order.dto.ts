import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
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
   * Costo unitario digitato in unità minori, interpretato netto o ivato secondo
   * costEntryMode di testata. NON è necessariamente intero: quando nasce da uno
   * scorporo IVA porta una coda decimale — fino a 4 cifre di centesimo, quante
   * ne tiene la colonna — ed è quella a far tornare il costo ivato digitato
   * quando lo si rimostra ivato (§sei decimali).
   */
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  enteredUnitCostMinor!: number;

  /**
   * Sconto riga a cascata già risolto in percentuale effettiva: «4+10%» arriva
   * qui come 13,6, non come 14. I decimali non sono un vezzo — arrotondarli
   * farebbe valere l'ordine registrato meno di quello che l'operatore ha letto.
   */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsUUID()
  vatCodeId?: string;

  /**
   * Unità di misura della riga, fotografata all'inserimento. Testo libero: la
   * tabella delle unità suggerisce, non obbliga (specifica §4.3-ter).
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitOfMeasure?: string;

  /**
   * Etichetta della VARIANTE, i soli valori: «M / Rosso». Vuota se l'articolo
   * non ha opzioni visibili.
   *
   * ⚠️ **Viaggia nel payload, e qui è una scelta obbligata.** Sulle altre due
   * tabelle di riga il server conserva l'etichetta persistita confrontando
   * l'id (`document-line-variant-snapshot.util`); qui non può, perché il
   * salvataggio è `deleteMany` + `create` e le righe perdono l'id. La
   * fotografa la maschera quando l'articolo entra nella riga — come
   * `unitOfMeasure` qui sopra, e per la stessa ragione.
   *
   * ⛔ Temporaneo per decisione del proprietario (24/08/2026): non è la
   * soluzione all'identità delle righe, è ciò che funziona finché quella
   * identità non c'è.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  variantLabel?: string;
}

export class CreateSupplierOrderDto {
  @IsUUID()
  supplierId!: string;

  /** Data ordine (testata); default: oggi. */
  @IsOptional()
  @IsISO8601()
  orderDate?: string;

  /**
   * Serie del numeratore. Assente = la serie predefinita del tipo.
   *
   * Fino al 12/08/2026 il client non poteva sceglierla: il server prendeva
   * sempre la predefinita, e l'Ordine fornitore era l'unico documento di
   * Categoria A senza serie in testata (specifica numerazione §5).
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  /**
   * Sede di destinazione della merce ordinata (§1-bis). Finisce in
   * `supplier_orders.destination_location_id`, colonna che esisteva già e non
   * aveva alcun percorso di scrittura.
   */
  @IsOptional()
  @IsUUID()
  destinationLocationId?: string;

  /**
   * Numero imposto dalla testata. Assente = lo assegna il server, primo libero
   * della serie. Se è già occupato risponde 409 col conflitto, come gli altri
   * documenti: chi salva sceglie fra numero nuovo e numero attuale.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  number?: number;

  @IsOptional()
  @IsISO8601()
  expectedAt?: string;

  /** "Rif. ordine fornitore": riferimento libero comunicato dal fornitore. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierReference?: string;

  /**
   * Sconto extra di chiusura sull'intero ordine (percentuale, fino a 4
   * decimali). Stessa forma di `documentDiscountPercent` su arrivo merce e
   * ordine cliente: il calcolo è già condiviso, qui arriva solo il numero.
   */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  documentDiscountPercent?: number;

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
  // ⚠️ Qui stavano i tre campi del «documento della controparte»
  // (`externalDocNumber`, `externalDocDate`, `externalDocumentTypeId`).
  // Tolti il 12/08/2026 insieme al blocco in testata: questo documento non ne
  // ha uno da citare. Chiudere anche l'ingresso serve — finché il DTO li
  // accetta, un client può scriverli e le colonne tornano a riempirsi di dati
  // che nessuna maschera mostra. Le colonne restano: toglierle è distruttivo su
  // database condiviso e aspetta la finestra concordata.
}
