import { AdjustmentDirection, StockMovementType } from '@core/models/stock-movement.model';
import type { StockMovement } from '@core/models/stock-movement.model';
import type { SortValueKind } from '@shared/utils/sort-values.util';

/**
 * Come si ordina ogni colonna del registro movimenti, e **quale valore** si
 * confronta.
 *
 * ⛔ **Mai la stampa, sempre il dato.** È la regola che rende l'ordinamento
 * corretto invece che verosimile, e i tre casi in cui la differenza si vede
 * sono misurati:
 *
 * - la **data** a schermo è «17 ago 2026»: ordinata come testo darebbe
 *   1 dic · 10 apr · 17 ago · 2 gen — l'ordine del giorno del mese, poi il nome
 *   del mese in alfabeto;
 * - la **quantità** a schermo porta il meno tipografico `−` (U+2212), che
 *   `parseFloat` non legge: ogni scarico varrebbe zero, e uscite e entrate si
 *   mescolerebbero;
 * - il **tipo** a schermo è una pill, e la sua cella di testo è vuota:
 *   ordinarla confronterebbe stringhe vuote e non farebbe **nulla**, mentre
 *   l'intestazione dichiara «Tipo crescente». È il fallimento peggiore, perché
 *   è muto.
 *
 * ⚠️ **Due colonne si ordinano per ETICHETTA, ed è voluto.** Tipo e Origine
 * portano in colonna un codice (`load`, `online_sale`) e mostrano una parola
 * tradotta («Carico», «Vendita online»). Chi guarda un elenco alfabetico si
 * aspetta l'ordine di ciò che legge: per una categoria che si presenta col
 * proprio nome, **il nome è il valore canonico**. La conseguenza va detta: qui
 * l'ordine non coincide con quello che darebbe il database, e non deve.
 *
 * Stessa lettura per **Location**, che nei trasferimenti vale
 * «Origine → Destinazione»: il valore è la relazione fra due sedi, non una
 * delle due.
 */
export const MOVEMENT_SORT_KINDS = {
  createdAt: 'date',
  type: 'text',
  articleCode: 'text',
  sku: 'text',
  product: 'text',
  signedQuantity: 'number',
  locationLabel: 'text',
  documentRef: 'text',
  reason: 'text',
  origin: 'text',
  createdByName: 'text',
} as const satisfies Record<string, SortValueKind>;

export type MovementSortColumn = keyof typeof MOVEMENT_SORT_KINDS;

export function isMovementSortColumn(columnId: string): columnId is MovementSortColumn {
  return columnId in MOVEMENT_SORT_KINDS;
}

/**
 * La quantità con il suo segno, **come numero**.
 *
 * ⚠️ Vive accanto alla sua formattazione apposta: sono la stessa decisione vista
 * da due lati, e se divergessero l'elenco mostrerebbe un segno e ne ordinerebbe
 * un altro — senza che niente lo segnali.
 */
export function movementSignedQuantity(movement: StockMovement): number {
  switch (movement.type) {
    case StockMovementType.Load:
    case StockMovementType.Return:
      return movement.quantity;
    case StockMovementType.Unload:
    case StockMovementType.Sale:
    case StockMovementType.OnlineSale:
      return -movement.quantity;
    case StockMovementType.Adjustment:
      return movement.direction === AdjustmentDirection.Decrease
        ? -movement.quantity
        : movement.quantity;
    case StockMovementType.Transfer:
      return movement.quantity;
  }
}

/**
 * La quantità come si legge in cella.
 *
 * ⚠️ Il meno è quello **tipografico** (U+2212), non il trattino: in una colonna
 * di cifre allineate a destra il trattino ASCII è corto e alto, e a colpo
 * d'occhio si confonde con un segno di elenco.
 *
 * Il **trasferimento non porta segno**: non toglie e non aggiunge, sposta — e un
 * «+3» su una riga di trasferimento affermerebbe un carico che non c'è stato.
 */
export function formatMovementQuantity(movement: StockMovement): string {
  const value = movementSignedQuantity(movement);
  if (movement.type === StockMovementType.Transfer) {
    return String(movement.quantity);
  }
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}
