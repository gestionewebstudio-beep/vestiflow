import type { Prisma } from '@prisma/client';

import { minorToDecimalString } from '../common/money.util';

/** Converte stringa decimale Shopify (es. "29.90") in unità minori intere. */
export function shopifyDecimalToMinor(amount: string, decimals = 2): number {
  const trimmed = amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return 0;
  }
  const negative = trimmed.startsWith('-');
  const normalized = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ''] = normalized.split('.');
  const frac = fracPart.padEnd(decimals, '0').slice(0, decimals);
  const minor = Number(`${intPart}${frac}`);
  if (!Number.isSafeInteger(minor)) {
    return 0;
  }
  return negative ? -minor : minor;
}

export function shopifyGid(type: string, id: string | number): string {
  return `gid://shopify/${type}/${id}`;
}

/**
 * Il GID di una risorsa a partire da un id salvato, QUALUNQUE forma abbia.
 *
 * Gli id Shopify persistiti sono numerici (eredità del REST: `10328079597863`),
 * ma possono arrivare già come GID da GraphQL o dai webhook. Questa è la sola
 * funzione che decide come si passa dall'uno all'altro: era scritta in due
 * posti (`toProductGid` nel client GraphQL, inline in category-metafields) e
 * una terza copia stava per nascere col push catalogo.
 */
export function toShopifyGid(type: string, id: string | number): string {
  const raw = String(id);
  return raw.startsWith('gid://') ? raw : shopifyGid(type, raw);
}

/** L'id numerico da un GID (`gid://shopify/Product/123` → `123`); un id già numerico resta com'è. */
export function legacyIdFromGid(gid: string): string {
  const at = gid.lastIndexOf('/');
  return gid.startsWith('gid://') && at >= 0 ? gid.slice(at + 1) : gid;
}

/**
 * Converte unità minori in stringa decimale Shopify (es. 2990 → "29.90").
 *
 * **Punto di uscita**: qui l'importo lascia VestiFlow, quindi qui — e non prima
 * — si arrotonda al centesimo. La conversione vive in `common/money.util`
 * perché non è una regola di Shopify ma del denaro: ogni canale deve
 * pubblicare lo stesso prezzo con lo stesso arrotondamento.
 */
export function minorToShopifyDecimal(amountMinor: Prisma.Decimal | number, decimals = 2): string {
  // ⭐ Accetta anche `Decimal`, che è ciò che arriva leggendo una colonna
  // `NUMERIC(16,6)`: la conversione avviene QUI, al confine, e non a monte —
  // l'anagrafica e i movimenti conservano la loro precisione, Shopify riceve
  // i due decimali che accetta.
  return minorToDecimalString(Number(amountMinor), decimals);
}
