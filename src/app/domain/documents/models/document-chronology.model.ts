import type { EntityId } from '@core/models/common.model';

/**
 * Un documento fuori posto nella sua serie (specifica numerazione §4): porta un
 * numero più alto di un altro, ma una data anteriore.
 */
export interface ChronologyAnomaly {
  readonly id: EntityId;
  readonly number: number;
  /** Data del documento, `AAAA-MM-GG` o istante ISO secondo la fonte. */
  readonly documentDate: string;
  /** Riferimento leggibile (`AM-A-0042`), quando il documento ce l'ha. */
  readonly reference: string | null;
}

/** Esito del controllo cronologico: l'elenco più lo stato della preferenza. */
export interface ChronologyCheck {
  readonly anomalies: readonly ChronologyAnomaly[];
  /** L'operatore ha spento l'avviso per questo tipo documento. */
  readonly dismissed: boolean;
}
