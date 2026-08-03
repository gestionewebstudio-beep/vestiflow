// Decisione: importi in unità minori, con una coda decimale ammessa (§sei
// decimali). I confronti «è cambiato?» si fanno al centesimo, non sul valore
// esatto — vedi `sameAmountAtCent` in money.util.
// Shopify MoneyV2 (decimal string) usato solo al confine via moneyToDecimalString.

import type { CurrencyCode } from './common.model';

/**
 * Importo monetario come value object Shopify-ready: ammontare in **unità
 * minori** della valuta (es. 1990 = 19,90 EUR) + `currencyCode` esplicito.
 *
 * L'ammontare è di norma intero, ma **può portare una parte decimale** quando
 * nasce da uno scorporo IVA: 25,00 ivati al 22% valgono 2049,180328 centesimi
 * netti, e conservare quella coda è ciò che fa tornare 25,00 quando il prezzo
 * viene rimostrato ivato. La precisione conservata è di 6 decimali di euro
 * (4 di centesimo), come le colonne `NUMERIC(16,6)` che la memorizzano.
 *
 * **A schermo e in stampa si mostrano sempre e solo 2 decimali**:
 * l'arrotondamento avviene all'uscita — `formatMoney`, `moneyToDecimalString`,
 * `minorToShopifyDecimal` — mai nei passaggi intermedi.
 */
export interface Money {
  /** Ammontare in unità minori della valuta (può avere coda decimale). */
  readonly amountMinor: number;
  /** Valuta ISO 4217 dell'importo (es. 'EUR'). */
  readonly currencyCode: CurrencyCode;
}
