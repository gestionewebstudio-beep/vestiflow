// Helper puri (framework-agnostici) per il value object Money.
//
// L'invariante è cambiata (§sei decimali): l'ammontare in unità minori NON è
// più necessariamente intero. Quando nasce da uno scorporo IVA porta una coda
// decimale — fino a 4 cifre di centesimo, cioè 6 decimali di euro — ed è quella
// coda a far tornare il prezzo digitato quando lo si rimostra ivato.
//
// Le regole che restano:
// - **l'arrotondamento avviene solo all'uscita**: `formatMoney`,
//   `moneyToDecimalString`, `minorToShopifyDecimal`. Mai a metà strada;
// - **all'operatore si mostrano sempre 2 decimali**, in ogni schermata e stampa;
// - **i confronti «è cambiato?» si fanno al centesimo** (`sameAmountAtCent`):
//   una coda decimale diversa non è una modifica per chi guarda.
//
// Il confine Shopify MoneyV2 (decimal string) passa per moneyToDecimalString /
// decimalStringToMoney.

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
 *
 * Se il valore può portare una coda decimale (netto scorporato da un ivato)
 * questo è il ponte sbagliato: arrotonda, e la coda muore qui. Vedi
 * `moneyFromMajorExact`.
 */
export function moneyFromMajor(
  major: number,
  currencyCode: CurrencyCode = DEFAULT_CURRENCY,
): Money {
  const factor = 10 ** currencyDecimals(currencyCode);
  return { amountMinor: Math.round(major * factor), currencyCode };
}

/**
 * Cifre di centesimo che il CONTRATTO conserva: quattro, cioè **6 decimali di
 * euro** (`1,234567 EUR = 123,4567 centesimi`).
 *
 * ⚠️ **Non è la capacità della colonna**: `NUMERIC(16,6)` di decimali ne
 * memorizza sei — sei di centesimo, cioè otto di euro. Ne usiamo quattro.
 * Gemella di `MINOR_TAIL_DECIMALS` del backend: le due sponde devono ridurre la
 * coda allo stesso modo.
 */
const MINOR_TAIL_DECIMALS = 4;

/**
 * Riduce la coda decimale a quello che la colonna sa tenere: 4 cifre di
 * centesimo, cioè 6 decimali di euro. NON è l'arrotondamento d'uscita — è la
 * forma memorizzabile del valore esatto. Oltre quelle cifre non c'è precisione,
 * c'è il rumore del float (`25 / 1.22` in binario non finisce mai), e il
 * backend lo rifiuta.
 */
export function toStorableMinor(amountMinor: number): number {
  const factor = 10 ** MINOR_TAIL_DECIMALS;
  return Math.round(amountMinor * factor) / factor;
}

/**
 * Ponte unità maggiori -> Money che CONSERVA la coda decimale. È quello da usare
 * quando il valore nasce da uno scorporo IVA: 25,00 ivati al 22% valgono
 * 2049,1803 centesimi netti, ed è quella coda a far tornare 25,00 quando il
 * prezzo viene rimostrato ivato.
 */
export function moneyFromMajorExact(
  major: number,
  currencyCode: CurrencyCode = DEFAULT_CURRENCY,
): Money {
  const factor = 10 ** currencyDecimals(currencyCode);
  return { amountMinor: toStorableMinor(major * factor), currencyCode };
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
    // Punto di uscita: due decimali, sempre. L'arrotondamento è esplicito e non
    // delegato a Intl, così questo formato e `moneyToDecimalString` non possono
    // divergere di un centesimo sullo stesso importo.
  }).format(moneyToMajor({ ...money, amountMinor: roundToMinor(money.amountMinor) }));
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

/**
 * Arrotonda al centesimo (unità minore intera). È il gesto dell'USCITA: si fa
 * quando il valore smette di essere calcolato e diventa qualcosa che qualcuno
 * legge, stampa o riceve.
 */
export function roundToMinor(amountMinor: number): number {
  return Math.round(amountMinor);
}

/**
 * Due importi sono lo stesso importo *per l'operatore*? Confronta al centesimo:
 * una coda decimale diversa (scorpori, ricalcoli) non è una modifica visibile e
 * non deve far scattare storici, conflitti o propagazioni verso i canali.
 */
export function sameAmountAtCent(a: number, b: number): boolean {
  return Math.round(a) === Math.round(b);
}

/** Serializza in stringa decimale stile Shopify MoneyV2 (es. "19.90"). */
export function moneyToDecimalString(money: Money): string {
  const decimals = currencyDecimals(money.currencyCode);
  const sign = money.amountMinor < 0 ? '-' : '';
  // Punto di uscita: la coda decimale sparisce qui, mai prima.
  const abs = Math.abs(roundToMinor(money.amountMinor)).toString();
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
