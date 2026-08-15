import { shopifyDecimalToMinor } from './shopify-money.util';

/**
 * Sconto allocato a una riga d'ordine Shopify, in unità minori.
 *
 * ⚠️ **Lo sconto del canale è un IMPORTO, quello di VestiFlow una PERCENTUALE**,
 * e le due forme non si convertono senza perdita. Il totale di una riga manuale
 * nasce da un prezzo unitario scontato e **arrotondato al centesimo prima**
 * della moltiplicazione (`discountedUnitPriceMinor`), quindi 16,00 € di sconto
 * su 3 pezzi da 20,00 tornerebbero indietro come 44,01 invece di 44,00. Per
 * questo la riga importata conserva **prezzo pieno e totale effettivo**, e lo
 * sconto resta la loro differenza: esatta al centesimo, senza una seconda
 * rappresentazione da tenere d'accordo con la prima.
 *
 * **La fonte è `discount_allocations`, non `total_discount`.** Uno sconto
 * inserito su Shopify come importo — e spesso applicato all'ordine intero, non
 * alla singola riga — arriva comunque **già ripartito dal canale sulle righe**.
 * Non c'è niente da spalmare a mano: la ripartizione l'ha fatta Shopify, ed è
 * quella che il cliente ha letto nella conferma d'ordine. `total_discount`
 * porta i soli sconti di riga e resta come ripiego per i payload che non
 * portano le allocazioni.
 *
 * _Registro difetti 3.9: le righe importate ignoravano lo sconto e non facevano
 * il totale dell'ordine — 120,00 € di righe su un ordine da 104,00._
 */
export function mapShopifyLineDiscountMinor(line: Record<string, unknown>): number {
  const allocations = line.discount_allocations as Record<string, unknown>[] | undefined;
  if (Array.isArray(allocations) && allocations.length > 0) {
    return allocations.reduce(
      (total, allocation) => total + shopifyDecimalToMinor(String(allocation.amount ?? '0')),
      0,
    );
  }

  return shopifyDecimalToMinor(String(line.total_discount ?? '0'));
}

/**
 * Totale effettivo della riga: prezzo pieno per quantità, meno lo sconto che il
 * canale le ha allocato. È il valore che deve sommare al subtotale dell'ordine.
 *
 * Il minimo a zero non è difensivo per abitudine: uno sconto maggiore del valore
 * di riga non esiste su un ordine reale, e se arrivasse un totale negativo
 * entrerebbe nei corrispettivi come una vendita al contrario.
 */
export function shopifyLineTotalMinor(
  unitPriceMinor: number,
  quantity: number,
  discountMinor: number,
): number {
  return Math.max(0, unitPriceMinor * quantity - discountMinor);
}
