import type { ParamMap } from '@angular/router';

import type { CorrispettiviListQuery } from './corrispettivi.model';

/**
 * I filtri del Registro Corrispettivi letti dall'indirizzo, **in un punto solo**.
 *
 * ## Perché esiste
 *
 * Perché non esisteva, e la stampa ne pagava il prezzo. La schermata passava
 * `ambito`, `canale`, `rowType` e `locationId` nell'indirizzo dell'anteprima di
 * stampa; l'anteprima leggeva il periodo e **basta**, più un `onlineOnly` che
 * nessuno mandava più e che l'API non conosce nemmeno — non un filtro
 * sbagliato: un campo inerte, che non arrivava neanche alla richiesta.
 *
 * Il risultato era una stampa che rispondeva a una domanda diversa da quella a
 * schermo: chi guardava «2° trimestre · Fisico/POS · Resi» stampava tutto il
 * trimestre, senza che niente lo segnalasse. Su un registro che va al
 * commercialista è il difetto peggiore — il foglio è plausibile, e nessuno
 * ricontrolla un totale che sembra giusto.
 *
 * ⚠️ **Due letture della stessa cosa divergono sempre**, ed è già successo qui.
 * Chi aggiunge un filtro al Registro lo aggiunge qui, e lo prendono entrambe.
 */

/** Valori ammessi per il tipo di riga: specchio del DTO dell'API. */
const ROW_TYPE_FILTERS: readonly string[] = ['all', 'sales', 'returns', 'refunds'];

/**
 * Le **origini** che il Registro conosce: specchio di `CORRISPETTIVI_ORIGINS`
 * dell'API. Sono i valori che esistono davvero, non un elenco di comodo.
 */
export const CORRISPETTIVI_ORIGINI: readonly string[] = [
  'shopify_online',
  'shopify_pos',
  'store',
  'manual_receipt',
];

export interface CorrispettiviFilters {
  readonly ambito: NonNullable<CorrispettiviListQuery['ambito']>;
  readonly canale: NonNullable<CorrispettiviListQuery['canale']>;
  /**
   * **Origine**: da cosa nasce la riga. Terza dimensione, non un sinonimo delle
   * prime due — senza, il Corrispettivo manuale non si isola: condivide con la
   * Vendita al banco la coppia Fisico/POS · VestiFlow.
   */
  readonly origine: string;
  readonly rowType: string;
  readonly locationId: string;
}

/** `all` è il predefinito di tutti e cinque, e non si scrive nell'indirizzo. */
export function parseCorrispettiviFilters(params: ParamMap): CorrispettiviFilters {
  const ambito = params.get('ambito');
  const canale = params.get('canale');
  const rowType = params.get('rowType') ?? 'all';
  const origine = params.get('origine') ?? 'all';

  return {
    ambito: ambito === 'online' || ambito === 'fisico_pos' ? ambito : 'all',
    canale: canale === 'shopify' || canale === 'vestiflow' ? canale : 'all',
    origine: CORRISPETTIVI_ORIGINI.includes(origine) ? origine : 'all',
    rowType: ROW_TYPE_FILTERS.includes(rowType) ? rowType : 'all',
    locationId: params.get('locationId') ?? 'all',
  };
}

/**
 * Gli stessi filtri nella forma che il service manda all'API.
 *
 * `all` diventa `undefined` dove l'API lo pretende (`rowType`, `locationId`) e
 * resta `all` dove è un valore legittimo (ambito e canale, che il `buildParams`
 * omette da sé). È l'unico punto in cui questa traduzione avviene: farla due
 * volte è il modo in cui elenco ed export smettono di rispondere alla stessa
 * domanda.
 */
export function corrispettiviFiltersToQuery(
  filters: CorrispettiviFilters,
): Pick<CorrispettiviListQuery, 'ambito' | 'canale' | 'origine' | 'rowType' | 'locationId'> {
  return {
    ambito: filters.ambito,
    canale: filters.canale,
    origine: filters.origine === 'all' ? undefined : filters.origine,
    rowType: filters.rowType === 'all' ? undefined : filters.rowType,
    locationId: filters.locationId === 'all' ? undefined : filters.locationId,
  };
}
