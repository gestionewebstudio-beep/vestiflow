import { parseMoneyInput } from '@core/utils/money.util';

/**
 * Come si confronta il contenuto di una colonna quando si riordina un elenco.
 *
 * Le COLONNE cambiano da una schermata all'altra — l'Ordine cliente ha il prezzo
 * di vendita, l'Arrivo merce il costo, i Movimenti la quantità con segno — ma i
 * modi di confrontare sono cinque, e sono questi. Elencare le colonne qui dentro
 * legherebbe un pezzo condiviso ai campi di una maschera sola.
 *
 * ⭐ Vive in `shared/` e non in `domain/documents/` perché **non sa nulla di
 * documenti**: lo dimostra il suo stesso test, che lo esercita su oggetti
 * `{ nome, qta }`. È nato per le righe documento ed è il secondo consumatore —
 * il registro movimenti — ad averlo portato qui: un util chiamato
 * `document-line-sort` che ordina il magazzino sarebbe stato il nome sbagliato
 * nel posto sbagliato (`regole-architettura`, «I nomi dichiarano l'appartenenza»).
 *
 * ⛔ L'unico import è `@core/utils/money.util`, e la sua catena è chiusa dentro
 * `core/`. È la condizione che rende legittima la posizione: `shared/` non può
 * importare da `domain/` né da `features/`.
 */
export type SortValueKind = 'text' | 'number' | 'money' | 'percent' | 'date';

/**
 * Confronta due valori secondo il modo indicato. Restituisce il verso
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
 *
 * **La data si confronta come istante**, non come stringa. Un ISO completo si
 * ordinerebbe bene anche come testo, ma solo finché tutte le stringhe hanno la
 * stessa forma: basta un fuso scritto diverso perché l'ordine cambi senza che
 * nessuno se ne accorga. Un istante non ha questo problema.
 */
export function compareSortValues(
  left: string | number,
  right: string | number,
  kind: SortValueKind,
  currencyCode: string,
): number {
  switch (kind) {
    case 'number':
      return toNumber(left) - toNumber(right);
    case 'percent':
      return toPercent(left) - toPercent(right);
    case 'money':
      return toMinor(left, currencyCode) - toMinor(right, currencyCode);
    case 'date':
      return toInstant(left) - toInstant(right);
    case 'text':
      return String(left).localeCompare(String(right), 'it', { sensitivity: 'base' });
  }
}

/**
 * Riordina leggendo da ogni elemento il valore della colonna scelta.
 *
 * Restituisce un array NUOVO: chi chiama decide se e come sostituire i propri
 * elementi. Il verso decrescente è il crescente rovesciato — un solo confronto
 * da mantenere, invece di due che possono divergere.
 */
export function sortByValue<C>(
  items: readonly C[],
  read: (item: C) => string | number,
  kind: SortValueKind,
  direction: 'asc' | 'desc',
  currencyCode: string,
): C[] {
  const verso = direction === 'asc' ? 1 : -1;
  return [...items].sort(
    (left, right) => verso * compareSortValues(read(left), read(right), kind, currencyCode),
  );
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

/**
 * Un numero è già un istante (epoch); una stringa passa da `Date.parse`.
 *
 * ⚠️ Una data assente o illeggibile vale `-Infinity`, non `0`: `0` è il 1970 e
 * si mescolerebbe con le date vere, mentre l'assenza deve stare a un estremo.
 */
function toInstant(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? Number.NEGATIVE_INFINITY : instant;
}

/** Una chiave di ordinamento: cosa leggere, come confrontarlo, in che verso. */
export interface SortKey<C> {
  readonly read: (item: C) => string | number;
  readonly kind: SortValueKind;
  readonly direction: 'asc' | 'desc';
}

/**
 * Riordina per PIÙ chiavi, la prima delle quali comanda.
 *
 * ⭐ A parità sulla prima chiave decide la seconda, e così via: è ciò che rende
 * utile ordinare per Prodotto e poi per Data — dentro ogni prodotto, le righe
 * restano in ordine cronologico invece di disporsi a caso.
 *
 * ⛔ **Non è `sortByValue` chiamato più volte.** Concatenare ordinamenti
 * funzionerebbe solo se ogni passata fosse stabile e le si applicasse
 * all'inverso; un comparatore composto dice la stessa cosa una volta sola, e
 * non dipende da una proprietà che nessuno ricorderebbe di verificare.
 *
 * Senza chiavi restituisce l'ordine di partenza — che è l'ordine con cui il
 * server ha risposto, e va lasciato intatto.
 */
export function sortByKeys<C>(
  items: readonly C[],
  keys: readonly SortKey<C>[],
  currencyCode: string,
): C[] {
  if (keys.length === 0) {
    return [...items];
  }
  return [...items].sort((left, right) => {
    for (const key of keys) {
      const verso = key.direction === 'asc' ? 1 : -1;
      const esito =
        verso * compareSortValues(key.read(left), key.read(right), key.kind, currencyCode);
      if (esito !== 0) {
        return esito;
      }
    }
    return 0;
  });
}
