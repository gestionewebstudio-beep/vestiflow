import { InternalServerErrorException } from '@nestjs/common';

import type { ShopifyGraphQlCostExtensions } from './shopify-rate-limiter.util';

/**
 * Il trasporto verso Shopify: timeout, errori transitori, scadenza complessiva.
 *
 * ⭐ Un solo posto per le regole che REST e GraphQL condividono (`docs/30` #3, #4 —
 *    blocco del 15/09/2026), così i due client non le riderivano ciascuno a modo suo:
 *
 * - **timeout** su ogni `fetch` (`SHOPIFY_API_TIMEOUT_MS`, 15 s): una chiamata appesa non
 *   tiene fermo un webhook o un push per minuti;
 * - **errori transitori** (timeout, rete, 502/503/504): si ritentano **SOLO le letture**
 *   (`SHOPIFY_API_READ_RETRIES`, 2), con l'attesa del limitatore per negozio;
 * - **scritture** (REST `POST/PUT/PATCH/DELETE`, GraphQL `mutation`): lo stesso errore è un
 *   **esito incerto** e NON si ritenta — chi scrive con una chiave (quantità) ha già il suo
 *   tentativo aperto; chi non ce l'ha (creazione prodotto, #5) non deve duplicare;
 * - **scadenza complessiva** (`SHOPIFY_API_DEADLINE_MS`, 60 s): attese comprese, oltre non
 *   si ritenta più, qualunque sia il motivo (429, throttling, transitorio).
 *
 * ⛔ Il 4xx (401/403/404/422/…) è PERMANENTE: ritentarlo non cambia la risposta.
 */
export type CausaTrasporto = 'timeout' | 'rete' | 'server' | 'scadenza' | 'risposta';

export class ShopifyTrasportoException extends InternalServerErrorException {
  constructor(
    readonly causa: CausaTrasporto,
    /** Una scrittura interrotta può essere stata eseguita: chi la riceve non deve ripeterla alla cieca. */
    readonly esitoIncerto: boolean,
    messaggio: string,
  ) {
    super(messaggio);
  }
}

const STATI_TRANSITORI = new Set([502, 503, 504]);

/** `502/503/504`: il canale o il suo bordo non hanno risposto; la richiesta può essere ritentata se legge. */
export function isStatoTransitorio(status: number): boolean {
  return STATI_TRANSITORI.has(status);
}

/**
 * L'errore lanciato da `fetch`, tradotto: `AbortError` = il nostro timeout; il resto è rete
 * (DNS, connessione rifiutata, chiusa a metà).
 */
export function causaDellaFetchFallita(error: unknown): 'timeout' | 'rete' {
  const nome = error instanceof Error ? error.name : '';
  return nome === 'TimeoutError' || nome === 'AbortError' ? 'timeout' : 'rete';
}

export function eccezioneDiTrasporto(
  causa: CausaTrasporto,
  scrittura: boolean,
  dettaglio: string,
): ShopifyTrasportoException {
  const testo = {
    timeout: 'Shopify non ha risposto entro il tempo previsto',
    rete: 'Shopify non è raggiungibile',
    server: 'Shopify ha risposto con un errore temporaneo',
    scadenza: 'Shopify non ha risposto entro il tempo complessivo previsto',
    risposta: 'Shopify ha risposto in modo non valido',
  }[causa];
  const coda = scrittura
    ? ' — scrittura con esito incerto: verifica sul negozio prima di ripetere'
    : '';
  return new ShopifyTrasportoException(causa, scrittura, `${testo}${coda} (${dettaglio})`);
}

/**
 * Se l'attesa pianificata porta oltre la scadenza complessiva, non si ritenta.
 * `adesso` è iniettabile per le prove con l'orologio finto.
 */
export function oltreLaScadenza(
  inizioMs: number,
  attesaMs: number,
  scadenzaMs: number,
  adesso: number = Date.now(),
): boolean {
  return adesso - inizioMs + attesaMs > scadenzaMs;
}

/**
 * Il tempo di UNA chiamata, dall'inizio alla fine: comprende le attese del limitatore, i
 * ritentativi e la lettura dell'intero corpo.
 *
 * ⛔ Prima la scadenza si controllava solo prima delle attese pianificate dal client: una
 *    pausa del limitatore (un 429 precedente sullo stesso negozio) poteva portare oltre e
 *    la chiamata partiva lo stesso, col timeout pieno (riprodotto il 15/09/2026). Ora dopo
 *    OGNI attesa si rilegge il residuo: a residuo zero non si invia niente, altrimenti la
 *    chiamata riceve un segnale lungo `min(timeout, residuo)`.
 */
/**
 * Un segnale che scade dopo `ms`, costruito con `setTimeout` e non con `AbortSignal.timeout`:
 * lo stesso significato (`TimeoutError`), ma il timer è quello del processo — si può
 * cancellare, non tiene vivo il processo (`unref`) e le prove con l'orologio controllato lo
 * governano. `AbortSignal.timeout` usa timer interni che nessun orologio finto raggiunge.
 */
export function segnaleDiTimeout(ms: number): AbortSignal {
  const controllo = new AbortController();
  const timer = setTimeout(
    () => controllo.abort(new DOMException('Tempo scaduto', 'TimeoutError')),
    ms,
  );
  timer.unref?.();
  return controllo.signal;
}

export class BudgetTrasporto {
  constructor(
    private readonly scadenzaMs: number,
    private readonly timeoutMs: number,
    private readonly inizio: number = Date.now(),
  ) {}

  residuoMs(adesso: number = Date.now()): number {
    return Math.max(0, this.scadenzaMs - (adesso - this.inizio));
  }

  /** L'attesa pianificata porterebbe oltre la scadenza. */
  oltre(attesaMs: number, adesso: number = Date.now()): boolean {
    return oltreLaScadenza(this.inizio, attesaMs, this.scadenzaMs, adesso);
  }

  /** Il segnale per la prossima chiamata, limitato al residuo; `null` se il tempo è finito. */
  segnale(adesso: number = Date.now()): AbortSignal | null {
    const residuo = this.residuoMs(adesso);
    if (residuo <= 0) {
      return null;
    }
    return segnaleDiTimeout(Math.min(this.timeoutMs, residuo));
  }

  /**
   * L'attesa del limitatore, tenuta entro il residuo: si interrompe alla scadenza con
   * un rifiuto, qualunque cosa faccia l'attesa (il limitatore vero rispetta il segnale e
   * lascia intatta la pausa del negozio; un'attesa che lo ignorasse resterebbe comunque
   * fuori dal cammino del chiamante, che riceve «scadenza» in tempo).
   */
  async attesaEntroIlResiduo(
    attesa: (segnale: AbortSignal) => Promise<void>,
    adesso: number = Date.now(),
  ): Promise<'attesa' | 'scaduta'> {
    const residuo = this.residuoMs(adesso);
    if (residuo <= 0) {
      return 'scaduta';
    }
    const segnale = segnaleDiTimeout(residuo);
    const scadenza = new Promise<'scaduta'>((resolve) => {
      segnale.addEventListener('abort', () => resolve('scaduta'), { once: true });
    });
    try {
      return await Promise.race([attesa(segnale).then(() => 'attesa' as const), scadenza]);
    } catch (error: unknown) {
      // Il limitatore rifiuta SOLO quando è il segnale a interromperlo; tutto il resto è suo.
      if (segnale.aborted) {
        return 'scaduta';
      }
      throw error;
    }
  }
}

/**
 * Le intestazioni sono arrivate, il CORPO no: `response.json()` / `text()` può fallire per
 * il nostro timeout (`AbortError`/`TimeoutError`), per la rete (`TypeError: terminated`) o
 * perché il corpo non è quello atteso (`SyntaxError`, JSON rotto).
 *
 * ⚠️ Per una SCRITTURA tutte e tre valgono «esito incerto»: le intestazioni dicono che la
 *    richiesta è arrivata, e con un `2xx` l'operazione è stata quasi certamente eseguita.
 */
export function causaDelCorpoFallito(error: unknown): 'timeout' | 'rete' | 'risposta' {
  if (error instanceof SyntaxError) {
    return 'risposta';
  }
  return causaDellaFetchFallita(error);
}

/**
 * GraphQL: una risposta è un RIFIUTO per throttling — cioè Shopify NON ha eseguito
 * l'operazione — solo se non porta `data` e ogni errore è `THROTTLED`.
 *
 * ⛔ Con `data` presente è una risposta PARZIALE (qualcosa è stato eseguito) e non si
 *    ritenta; con altri codici è un errore permanente. Vale per query e mutation: una
 *    mutation rifiutata prima dell'esecuzione non ha effetti, quindi ripeterla non
 *    duplica (shopify.dev: «Throttled — the client has exceeded the rate limit»,
 *    risposta `200` con `errors[].extensions.code = THROTTLED`).
 */
export function isRifiutoPerThrottling(json: {
  readonly data?: unknown;
  readonly errors?: readonly { readonly extensions?: { readonly code?: string } }[];
}): boolean {
  if (json.data != null || !json.errors?.length) {
    return false;
  }
  return json.errors.every((e) => e.extensions?.code === 'THROTTLED');
}

/**
 * Quanti secondi aspettare dopo un rifiuto per throttling: il deficit di punti diviso
 * per il ripristino al secondo (almeno 1 s). Senza `throttleStatus` decide il backoff.
 */
export function attesaDopoThrottlingSeconds(
  cost: ShopifyGraphQlCostExtensions | null | undefined,
): number | null {
  const stato = cost?.throttleStatus;
  if (!stato || stato.restoreRate <= 0) {
    return null;
  }
  const richiesti = cost.requestedQueryCost ?? stato.maximumAvailable;
  const deficit = Math.max(0, richiesti - stato.currentlyAvailable);
  return Math.max(1, Math.ceil(deficit / stato.restoreRate));
}
