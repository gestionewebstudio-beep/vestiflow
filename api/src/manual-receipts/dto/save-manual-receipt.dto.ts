import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Una riga della registrazione: `Descrizione · Importo · Codice IVA`.
 *
 * ⚠️ **Non c'è quantità, né SKU, né variante, e non è una dimenticanza.** Una
 * registrazione che non conosce gli articoli non può muovere quantità (`10`
 * §12): aggiungere qui un `variantId` sarebbe il primo passo per inventare
 * merce.
 */
export class SaveManualReceiptLineDto {
  /**
   * **Facoltativa.** Su una chiusura di cassa i dati che contano sono importo e
   * aliquota: la descrizione dice a cosa si riferisce, e spesso non c'è niente
   * da aggiungere. Una riga con solo importo e Codice IVA è una riga valida.
   *
   * Vuota è quindi ammessa due volte: come riga compilata senza descrizione, e
   * come riga pronta all'inserimento — che però si scarta perché non porta
   * nemmeno un importo (`isEmptyManualReceiptLine`).
   */
  @IsString()
  @MaxLength(500)
  description = '';

  /**
   * L'importo digitato, in unità minori, **nella modalità della testata**.
   *
   * `@IsNumber` con i decimali ammessi e non `@IsInt`: in modalità netta la
   * maschera rimanda il netto canonico con la sua coda, ed è ciò che fa tornare
   * l'ivato identico al giro successivo. Troncarlo qui butterebbe via proprio la
   * coda che la colonna `NUMERIC(16,6)` esiste per tenere.
   */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  amountMinor = 0;

  /**
   * Obbligatorio quando la riga non è vuota — lo verifica il service, che sa
   * dire quale riga. Qui resta facoltativo perché la riga vuota arriva senza.
   */
  @IsOptional()
  @IsUUID()
  vatCodeId?: string;
}

/**
 * Creazione e modifica del Corrispettivo manuale: **lo stesso corpo**.
 *
 * La modifica aggiorna lo stesso record e ne riscrive le righe per intero
 * (`10` §12): non esiste un salvataggio parziale, e mandare l'elenco completo è
 * ciò che rende la modifica descrivibile in una transazione sola.
 *
 * ⚠️ **Niente numero, niente serie.** Il numero lo assegna il motore comune al
 * primo salvataggio e non si tocca più: non è un progressivo fiscale, è
 * l'identificativo della registrazione, e i buchi sono ammessi (`10` §12).
 */
export class SaveManualReceiptDto {
  /** Data economica: è quella che determina il periodo del Registro. Una sola. */
  @Matches(ISO_DATE, { message: 'La data della registrazione non è valida.' })
  documentDate!: string;

  /**
   * Sede: obbligatoria, ed è una regola del **modello**, non una convalida di
   * maschera — `manual_receipts.location_id` è `NOT NULL` (`10` §12).
   */
  @IsUUID()
  locationId!: string;

  /**
   * Modalità della registrazione. **Parte da ivata** (il default della colonna):
   * il caso operativo è ricopiare i valori di una chiusura di cassa, che ivati
   * lo sono. Nessuna memoria dell'operatore, nessuna convenzione aziendale: la
   * registrazione non è un documento di vendita.
   */
  @IsOptional()
  @IsBoolean()
  pricesIncludeVat?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Aggiungi almeno una riga alla registrazione.' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SaveManualReceiptLineDto)
  lines!: SaveManualReceiptLineDto[];
}
