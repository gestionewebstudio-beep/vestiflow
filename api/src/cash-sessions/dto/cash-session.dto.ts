import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  Max,
  ValidateNested,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { UnpagedQueryDto } from '../../common/dto/unpaged.util';

/**
 * ⛔ **Nessun DTO porta `tenantId`, `openedByName` o lo stato**: arrivano dal
 * contesto autenticato. Un campo che il chiamante sceglie non è un dato, è una
 * richiesta — e questi tre non sono negoziabili (`docs/25` §13).
 */

export class OpenCashSessionDto {
  @IsUUID()
  locationId!: string;

  /**
   * Fondo iniziale in unità minori.
   *
   * ⚠️ `@Min(0)`: zero è legittimo (si apre senza fondo), negativo no.
   */
  @IsInt()
  @Min(0)
  openingFloatMinor!: number;

  /**
   * Dispositivo fiscale operativo, o assente.
   *
   * ⭐ Una sessione **senza dispositivo** è valida: quella sede non fiscalizza.
   */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsUUID()
  fiscalDeviceId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CashSessionMovementDto {
  @IsIn(['deposit', 'withdrawal'])
  type!: 'deposit' | 'withdrawal';

  /** ⛔ Strettamente positivo: il verso lo dice `type`, non il segno. */
  @IsInt()
  @Min(1)
  amountMinor!: number;

  /**
   * ⛔ Obbligatoria: un versamento o un prelievo senza motivo non è
   * ricostruibile a distanza di mesi, e non si può correggere — si corregge con
   * un movimento opposto che cita questo.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason!: string;
}

export class ChangeCashSessionDeviceDto {
  /**
   * Il dispositivo nuovo, o `null` per toglierlo.
   *
   * ⛔ **Il PRECEDENTE non si manda**: lo determina il server dentro la
   * transazione. Un precedente inviato dal client è una versione del mondo
   * vecchia di un round-trip.
   */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsUUID()
  fiscalDeviceId!: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason!: string;
}

export class CashSessionLocationQueryDto {
  @IsUUID()
  locationId!: string;
}

// ── Consultazione: registro operativo e sessioni ───────────────────────────

/**
 * Base delle query paginate della Cassa.
 *
 * ⚠️ `@Type(() => Number)`: una query string arriva SEMPRE come testo, e
 * senza la conversione `@IsInt()` rifiuterebbe ogni richiesta.
 */
/**
 * ⭐ **Estende `UnpagedQueryDto`**, che porta `all=1` — «tutto il risultato
 * del filtro attivo». E` lo stesso percorso di clienti, prodotti, documenti,
 * giacenze, ordini e vendite online: non un secondo modo di dire la stessa
 * cosa.
 *
 * ⛔ **La paginazione resta nel contratto** e non e` un residuo: `page` e
 * `pageSize` valgono quando `all` non c'e`, e la risposta continua a portare
 * `total`, `page` e `pageSize`. Chi impagina non si accorge di niente.
 */
export class CashPageQueryDto extends UnpagedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  /*
    ⚠️ **QUESTO NON E` PIU` IL TETTO DELL'ELENCO**, e la distinzione conta.

    ⛔ Qui c_era «CINQUEMILA, misurate il 05/09/2026», con la tabella dei
    tempi: era il tetto alzato da 200 a 5.000 perche` i registri chiedevano
    una pagina sola. **Non chiudeva il problema** — «entrambi i registri
    chiedono ancora `page: 1` e le operazioni successive restano
    irraggiungibili», proprietario, 05/09/2026. Un tetto piu` alto e` sempre
    un tetto.

    ⭐ I due registri ora chiedono `all=1` e ricevono **tutto il risultato**
    del filtro: il contenimento e` il PERIODO, come dice `UnpagedQueryDto`.

    ⚠️ **Il tetto resta per chi impagina davvero**, ed e` la ragione per cui
    non si toglie: `pageSize` senza limite e` una richiesta che un client
    puo` fare per sbaglio. 5.000 e` la misura oltre la quale non ha piu`
    senso una PAGINA — chi vuole tutto lo chiede con `all`, e lo dichiara.

    La misura resta valida ed e` in `docs/25`: 5.000 righe costano 284 ms e
    3,9 MB, 20.000 ne costano 1.074 e 15,6 MB — lineare, nessun N+1.
  */
  @Max(5_000)
  pageSize: number = 50;

  /** Giorno di inizio, incluso (`AAAA-MM-GG`). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Giorno di fine, incluso. */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  operatorId?: string;
}

/** Il registro operativo: vendite e resi di Cassa. */
export class CashOperationsQueryDto extends CashPageQueryDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsIn(['sale', 'return'])
  kind?: 'sale' | 'return';

  @IsOptional()
  @IsUUID()
  paymentOptionId?: string;

  @IsOptional()
  @IsIn(['cash', 'electronic', 'voucher'])
  tenderKind?: 'cash' | 'electronic' | 'voucher';

  /** Numero o riferimento del documento, anche parziale. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  number?: string;

  /**
   * Solo le operazioni con anomalie.
   *
   * ⚠️ Le anomalie sono cinque e sono DICHIARATE (`docs/25` §13-septies):
   * annullato, quota non classificata, reso senza origine, rimborso non
   * agganciato, quote che non sommano al totale.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  anomaliesOnly?: boolean;
}

/** Le sessioni: elenco filtrabile. */
export class CashSessionsQueryDto extends CashPageQueryDto {
  @IsOptional()
  @IsIn(['open', 'closed'])
  status?: 'open' | 'closed';
}

/**
 * La ricerca dello scontrino per il reso: **senza UUID**.
 *
 * ⛔ L'operatore cerca per numero, cliente o articolo — non per
 * identificativo. Il `documentId` resta il modo con cui il reso si aggancia.
 */
export class ReceiptSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  text?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** Importo esatto in unità minori: è il modo più veloce di riconoscerlo. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

// ── Checkout (tranche C4A) ─────────────────────────────────────────────────

export class CheckoutLineDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /**
   * Prezzo unitario NETTO in unità minori. ⚠️ Il server ricalcola comunque.
   *
   * ⭐ DECIMALE e non intero: la colonna è `Decimal(16,6)`, e la coda è ciò che
   * fa tornare identico un prezzo digitato ivato («unitari decimali, totali
   * interi», `regole-gestionale`).
   */
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  unitPriceMinor!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsUUID()
  vatCodeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class CheckoutPaymentDto {
  @IsUUID()
  paymentOptionId!: string;

  /** ⛔ Strettamente positiva: il verso lo dice il tipo documento. */
  @IsInt()
  @Min(1)
  amountMinor!: number;

  /** Solo contanti: il denaro consegnato. Il resto è derivato, non si manda. */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsInt()
  @Min(0)
  tenderedMinor?: number | null;

  /**
   * Solo elettronico: l'operatore conferma l'esito letto sul terminale.
   *
   * ⛔ VestiFlow non parla col POS e non finge di averlo fatto.
   */
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

export class CashCheckoutDto {
  @IsUUID()
  locationId!: string;

  @IsUUID()
  sessionId!: string;

  /**
   * L'identità dell'operazione, generata dal client una volta per compilazione.
   *
   * ⛔ Obbligatoria: senza, una vendita non è deduplicabile e un reinvio
   * creerebbe un secondo documento con i suoi movimenti.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  creationIntentId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutLineDto)
  lines!: CheckoutLineDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutPaymentDto)
  payments!: CheckoutPaymentDto[];
}

// ── Chiusura della sessione (tranche C4B) ──────────────────────────────────

/**
 * La chiusura: si dichiara quello che si e` CONTATO, non quello che ci si
 * aspettava.
 *
 * ⭐ Gli attesi non compaiono qui e non compaiono in nessuna risposta finche`
 * la sessione e` aperta: la chiusura e` CIECA (`docs/25` §9).
 */
export class CloseCashSessionDto {
  /**
   * Il contante CONTATO aprendo il cassetto.
   *
   * ⚠️ `@Min(0)`: zero e` legittimo — un cassetto vuoto e` un conteggio, non
   * un dato mancante.
   */
  @IsInt()
  @Min(0)
  countedCashMinor!: number;

  /**
   * Il totale che l'operatore LEGGE sul terminale e dichiara.
   *
   * ⛔ Non e` una risposta tecnica del POS: VestiFlow non parla col terminale
   * e non finge di averlo fatto. Assente o `null` significa «non
   * riconciliato», ed e` una chiusura legittima.
   */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsInt()
  @Min(0)
  declaredElectronicMinor?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ── Reso collegato allo scontrino (tranche C4R) ────────────────────────────

export class ReturnLineDto {
  /**
   * La riga della vendita originale che si sta rettificando.
   *
   * ⛔ Obbligatoria: un reso non collegato non è previsto, e senza il legame il
   * limite cumulativo non sarebbe calcolabile (`docs/25` §12).
   */
  @IsUUID()
  originalLineId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ReturnRefundDto {
  /**
   * La QUOTA dell'incasso originale che si sta restituendo.
   *
   * ⛔ Non il Tipo pagamento: due quote possono avere lo stesso Tipo, e il
   * Tipo può non esistere più. Il servizio verifica che appartenga alla
   * vendita richiamata (`docs/25` §12).
   */
  @IsUUID()
  originalPaymentId!: string;

  /** ⭐ POSITIVO: la direzione la dà il tipo documento `store_return`. */
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

export class CashReturnDto {
  @IsUUID()
  locationId!: string;

  @IsUUID()
  sessionId!: string;

  /** La vendita richiamata. */
  @IsUUID()
  originalDocumentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  creationIntentId!: string;

  /** Il motivo del reso, obbligatorio. */
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines!: ReturnLineDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnRefundDto)
  refunds!: ReturnRefundDto[];
}
