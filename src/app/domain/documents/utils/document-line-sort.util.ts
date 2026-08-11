import { parseMoneyInput } from '@core/utils/money.util';

/**
 * Come si confronta il contenuto di una colonna quando si riordinano le righe.
 *
 * Le COLONNE cambiano da un documento all'altro — l'Ordine cliente ha il prezzo
 * di vendita, l'Arrivo merce il costo, l'Ordine fornitore il codice fornitore —
 * ma i modi di confrontare sono quattro, e sono questi. Elencare le colonne qui
 * dentro avrebbe legato un pezzo condiviso ai campi di una maschera sola: è
 * l'errore che il resto di questo lavoro sta togliendo.
 */
export type DocumentLineSortKind = 'text' | 'number' | 'money' | 'percent';

/**
 * Confronta due valori di riga secondo il modo indicato. Restituisce il verso
 * crescente; il decrescente è chi chiama a rovesciarlo.
 *
 * **Il testo si confronta come lo leggerebbe un italiano** (`localeCompare` con
 * `sensitivity: 'base'`): «Àlbero» sta accanto ad «albero», non in fondo dopo
 * la Z. Un ordinamento per codice ASCII in un elenco di nomi propri sembra
 * rotto anche quando è coerente.
 *
 * **Il denaro passa dal suo lettore** (`parseMoneyInput`), non da `parseFloat`:
 * nella cella c'è quello che l'operatore ha digitato — «1.234,50», con la
 * virgola decimale italiana — e `parseFloat` di quella stringa legge 1.
 * Un valore illeggibile vale meno di zero, così le righe non compilate restano
 * in fondo in ordine crescente invece di mescolarsi con quelle a zero.
 */
export function compareDocumentLineValues(
  left: string | number,
  right: string | number,
  kind: DocumentLineSortKind,
  currencyCode: string,
): number {
  switch (kind) {
    case 'number':
      return toNumber(left) - toNumber(right);
    case 'percent':
      return toPercent(left) - toPercent(right);
    case 'money':
      return toMinor(left, currencyCode) - toMinor(right, currencyCode);
    case 'text':
      return String(left).localeCompare(String(right), 'it', { sensitivity: 'base' });
  }
}

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number.parseFloat(value) || 0;
}

/** Le percentuali arrivano come testo dalla cella: «22», «22%», «4+10». */
function toPercent(value: string | number): number {
  return typeof value === 'number' ? value : Number.parseFloat(value) || 0;
}

/** Illeggibile o vuoto = −1: le righe non compilate restano in fondo. */
function toMinor(value: string | number, currencyCode: string): number {
  if (typeof value === 'number') {
    return value;
  }
  return parseMoneyInput(value, currencyCode)?.amountMinor ?? -1;
}
