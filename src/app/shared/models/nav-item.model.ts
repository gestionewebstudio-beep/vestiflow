import type { IsActiveMatchOptions } from '@angular/router';

/** Voce di navigazione della sidebar applicativa. */
export interface NavItem {
  readonly label: string;
  /** Classe icona PrimeIcons (es. 'pi-th-large'). */
  readonly icon: string;
  /** Route assoluta di destinazione (es. '/app/dashboard'). */
  readonly route: string;
  /** Query params della destinazione (es. { type: 'proforma' } sul registro documenti). */
  readonly queryParams?: Readonly<Record<string, string>>;
  /**
   * Prefisso usato per evidenziare la voce su tutte le sotto-route della sezione
   * (es. '/app/inventory' quando `route` punta a '/app/inventory/lookup').
   */
  readonly activeRoutePrefix?: string;
  /** Route escluse dall'evidenza (es. '/app/sales/register' per la voce Vendite). */
  readonly activeRouteExclude?: readonly string[];
  /** Voce non ancora attiva (feature in preparazione): mostrata ma non navigabile. */
  readonly disabled?: boolean;
  /**
   * Contatore opzionale mostrato come pill accento accanto alla voce
   * (es. ordini fornitore in sospeso "6"). Assente = nessun badge.
   */
  readonly badge?: string | number;
  /** Opzioni legacy per evidenziare la voce; preferire activeRoutePrefix. */
  readonly linkActiveOptions?: IsActiveMatchOptions;
}

/** Gruppo di voci sidebar con intestazione opzionale (es. «Vendite»). */
export interface NavSection {
  /** Chiave stabile per il track del template. */
  readonly id: string;
  /** Intestazione visibile del gruppo; assente per il gruppo principale. */
  readonly label?: string;
  readonly items: readonly NavItem[];
}
