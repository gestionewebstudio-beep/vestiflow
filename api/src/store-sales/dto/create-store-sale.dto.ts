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
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const STORE_SALE_PAYMENT_METHODS = ['cash', 'card', 'other'] as const;
export type StoreSalePaymentMethod = (typeof STORE_SALE_PAYMENT_METHODS)[number];

/** Riga carrello Vendita al banco (fase 3 §7). */
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

  /**
   * Identità dell'**intento di creazione** (T15): generata dal client una volta
   * per compilazione e conservata attraverso i tentativi.
   *
   * ⛔ Rende idempotente il reinvio: se la transazione ha già committato e la
   * risposta si è persa, la seconda richiesta con lo stesso intento **non crea
   * una seconda vendita** — restituisce quella già registrata.
   *
   * ⚠️ **Due compilazioni distinte sono due intenti, anche a payload identico.**
   * Due clienti che comprano la stessa maglietta nello stesso minuto restano due
   * vendite: la distinzione non è nei dati, è nell'intento.
   *
   * ⛔ **OBBLIGATORIO IN CREAZIONE** (T15B). Con `id` assente il server rifiuta
   * la richiesta: una vendita nuova senza identità d'intento non è creabile.
   *
   * ⚠️ Qui c'era `@IsOptional()`, e serviva a far convivere il backend di T15A
   * con un client che l'intento non lo mandava ancora. Migrato il client, il
   * comportamento «senza intento creo comunque» non si lascia in piedi: era un
   * ponte, non un contratto.
   *
   * **In MODIFICA non si valida e non serve**: `@ValidateIf` spegne il vincolo
   * quando `id` è presente, perché lì non si crea niente e rivendicare un
   * intento impedirebbe la seconda modifica legittima dello stesso documento.
   */
  @ValidateIf((o: CreateStoreSaleDto) => !o.id)
  @IsString()
  @Length(8, 128)
  creationIntentId?: string;

  @IsUUID()
  locationId!: string;

  /**
   * Serie del contatore, **stessa semantica di ogni altro documento** (T8A):
   *
   * ```text
   * assente         → «decidi tu»: il server risolve dal contatore predefinito della sede
   * stringa vuota   → «Senza serie», che è una SCELTA e scavalca il predefinito
   * valore          → quella serie (con trim)
   * ```
   *
   * ⛔ «Senza serie» non è un caso speciale della cassa: è uno dei valori del
   * sistema comune delle serie, e corrisponde a un contatore reale che
   * `seedDefaults` semina per ogni tipo. Il documento ha comunque sempre il
   * proprio numero.
   *
   * ⚠️ La distinzione fra assente e vuota NON è formale: le maschere mandavano
   * `series: … || undefined` e chi sceglieva «Senza serie» otteneva il
   * contrario — il documento usciva sotto la serie predefinita, che poteva
   * essere di un'altra sede.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  /**
   * Numero imposto dalla testata: assente = primo libero della serie, assegnato
   * dal server dentro la transazione che scrive. Un numero imposto **non sposta
   * il progressivo**: i documenti successivi ripartono dal massimo esistente+1.
   *
   * ⚠️ Non si valida preventivamente: il vincolo unico del database è l'unica
   * verità, e la collisione torna come `document_number_taken` (T7B).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  number?: number;

  /**
   * Metodo di pagamento, **facoltativo** (`11` A8).
   *
   * ⛔ Era obbligatorio, ed era un'eredità della vecchia cassa: quella maschera
   * un valore ce l'ha sempre, quindi il vincolo non si notava. La gestione
   * Pagamenti della maschera nuova è **differita al blocco Pagamenti/Tesoreria**
   * e userà la struttura comune agli altri documenti: fino ad allora la nuova
   * Vendita non manda niente, e obbligarla a scegliere le farebbe inventare un
   * predefinito che nessuno ha deciso.
   *
   * ⚠️ **Assente ≠ vuoto**, ed è la differenza che protegge i documenti già
   * registrati: su un documento ESISTENTE l'assenza significa «non modificato»
   * e il servizio conserva quello persistito. Interpretarla come «nessun
   * pagamento» cancellerebbe il dato storico al primo risalvataggio.
   */
  @IsOptional()
  @IsIn(STORE_SALE_PAYMENT_METHODS)
  paymentMethod?: StoreSalePaymentMethod;

  /**
   * Descrizione libera quando paymentMethod = 'other' (es. «Assegno»). Il
   * codice resta 'other' per il filtro dell'elenco; questo testo si mostra
   * accanto ad «Altro». Ignorato per cash/card.
   *
   * ⚠️ Segue il metodo: se il metodo non è dichiarato, questa nota non si
   * riscrive — resta quella persistita.
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
