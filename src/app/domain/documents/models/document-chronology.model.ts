import type { EntityId } from '@core/models/common.model';

/**
 * Come il documento in salvataggio rompe l'ordine rispetto a quello trovato.
 *
 * - `precede` — il trovato ha un numero **più basso** e una data **successiva**:
 *   sta prima nella numerazione e dopo nel tempo. È il caso di tutti i giorni.
 * - `segue` — numero **più alto** e data **anteriore**.
 */
export type ChronologyDirection = 'precede' | 'segue';

/**
 * Il documento già registrato che con quello in salvataggio non sta in ordine
 * (specifica numerazione §4).
 */
export interface ChronologyConflict {
  readonly id: EntityId;
  readonly number: number;
  /** Data del documento, `AAAA-MM-GG` o istante ISO secondo la fonte. */
  readonly documentDate: string;
  /** Riferimento leggibile (`AM-A-0042`), quando il documento ce l'ha. */
  readonly reference: string | null;
  readonly direction: ChronologyDirection;
}

/** Esito del controllo cronologico: i conflitti più lo stato della preferenza. */
export interface ChronologyCheck {
  readonly conflicts: readonly ChronologyConflict[];
  /** L'operatore ha spento l'avviso per questo tipo documento. */
  readonly dismissed: boolean;
}
