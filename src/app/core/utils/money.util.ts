// Helper puri (framework-agnostici) per il value object Money (unità minori
// intere). Nessun float nel dominio: parsing/serializzazione lavorano su stringhe
// e interi. Il confine Shopify MoneyV2 (decimal string) passa per
// moneyToDecimalString / decimalStringToMoney.

import type { CurrencyCode } from '../models/common.model';
import type { Money } from '../models/money.model';

/** Valuta di default finché non arriva il contesto tenant/store. */
export const DEFAULT_CURRENCY: CurrencyCode = 'EUR';

// Eccezioni note all'esponente 2 (ISO 4217). Lista minima, non esaustiva.
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP']);
const THREE_DECIMAL_CURRENCIES = new Set(['KWD', 'BHD', 'OMR', 'TND']);

/** Numero di cifre decimali (esponente) della valuta. Default 2. */
export function currencyDecimals(currencyCode: CurrencyCode): number {
  const code = currencyCode.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) {
    return 0;
  }
  if (THREE_DECIMAL_CURRENCIES.has(code)) {
    return 3;
  }
  return 2;
}

/** Importo zero nella valuta indicata. */
export function zeroMoney(currencyCode: CurrencyCode = DEFAULT_CURRENCY): Money {
  return { amountMinor: 0, currencyCode };
}

/**
 * Costruisce un Money da un valore in unità maggiori (es. 19.9 -> 1990).
 * Usa Math.round: adatto a costanti controllate (seed mock) e al ponte del form,
 * NON a parsing diretto di input utente (vedi parseMoneyInput).
 */
export function moneyFromMajor(
  major: number,
  currencyCode: CurrencyCode = DEFAULT_CURRENCY,
): Money {
  const factor = 10 ** currencyDecimals(currencyCode);
  return { amountMinor: Math.round(major * factor), currencyCode };
}

/** Valore in unità maggiori (per formattazione e ponte del form). */
export function moneyToMajor(money: Money): number {
  return money.amountMinor / 10 ** currencyDecimals(money.currencyCode);
}

/** Formattazione localizzata currency-aware (display). */
export function formatMoney(money: Money, locale = 'it-IT'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currencyCode,
  }).format(moneyToMajor(money));
}

/**
 * Converte input utente (it-IT: virgola o punto, eventuali separatori migliaia)
 * in Money senza passare da float: usa l'ultimo separatore come decimale, scarta
 * i separatori delle migliaia, tronca la parte decimale all'esponente valuta.
 * Ritorna null se il testo non è un numero valido.
 */
export function parseMoneyInput(
  text: string,
  currencyCode: CurrencyCode = DEFAULT_CURRENCY,
): Money | null {
  let s = text.trim().replace(/\s/g, '');
  if (s === '') {
    return null;
  }
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[0-9.,]+$/.test(s)) {
    return null;
  }
  const sepIndex = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let intPart = sepIndex === -1 ? s : s.slice(0, sepIndex);
  const fracPart = sepIndex === -1 ? '' : s.slice(sepIndex + 1);
  intPart = intPart.replace(/[.,]/g, '');
  if (/[.,]/.test(fracPart)) {
    return null;
  }
  if (intPart === '') {
    intPart = '0';
  }
  if (!/^[0-9]+$/.test(intPart) || (fracPart !== '' && !/^[0-9]+$/.test(fracPart))) {
    return null;
  }
  const decimals = currencyDecimals(currencyCode);
  const frac =
    decimals === 0
      ? ''
      : fracPart.length > decimals
        ? fracPart.slice(0, decimals)
        : fracPart.padEnd(decimals, '0');
  const amountMinor = Number(`${intPart}${frac}`);
  if (!Number.isSafeInteger(amountMinor)) {
    return null;
  }
  return { amountMinor: negative ? -amountMinor : amountMinor, currencyCode };
}

/** Serializza in stringa decimale stile Shopify MoneyV2 (es. "19.90"). */
export function moneyToDecimalString(money: Money): string {
  const decimals = currencyDecimals(money.currencyCode);
  const sign = money.amountMinor < 0 ? '-' : '';
  const abs = Math.abs(money.amountMinor).toString();
  if (decimals === 0) {
    return `${sign}${abs}`;
  }
  const padded = abs.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals);
  return `${sign}${intPart}.${fracPart}`;
}

/** Costruisce un Money da una stringa decimale Shopify MoneyV2. */
export function decimalStringToMoney(amount: string, currencyCode: CurrencyCode): Money {
  return parseMoneyInput(amount, currencyCode) ?? zeroMoney(currencyCode);
}

/** Due importi nella stessa valuta. */
export function sameCurrency(a: Money, b: Money): boolean {
  return a.currencyCode === b.currencyCode;
}

/**
 * Coerenza del prezzo "barrato": stessa valuta del prezzo e strettamente
 * maggiore (compareAtPrice è il "prezzo precedente" più alto, semantica Shopify).
 */
export function isValidCompareAt(price: Money, compareAt: Money): boolean {
  return sameCurrency(price, compareAt) && compareAt.amountMinor > price.amountMinor;
}
