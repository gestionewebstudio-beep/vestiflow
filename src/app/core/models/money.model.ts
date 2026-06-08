// Decisione: minor units integer. Confronti float-free nel dominio.
// Shopify MoneyV2 (decimal string) usato solo al confine via moneyToDecimalString.

import type { CurrencyCode } from './common.model';

/**
 * Importo monetario come value object Shopify-ready: ammontare in **unità
 * minori** della valuta (intero, es. 1990 = 19,90 EUR) + `currencyCode`
 * esplicito. L'intero evita errori di virgola mobile su somme e confronti.
 */
export interface Money {
  /** Ammontare in unità minori della valuta (intero). */
  readonly amountMinor: number;
  /** Valuta ISO 4217 dell'importo (es. 'EUR'). */
  readonly currencyCode: CurrencyCode;
}
