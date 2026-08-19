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
  /**
   * Route escluse dall'evidenza, quando una voce ne contiene un'altra.
   *
   * ⚠️ **Nessuna voce reale lo usa oggi.** L'esempio citato qui era
   * '/app/sales/register' escluso dalla voce Vendite: quel percorso e' uscito da
   * /app/sales il 19/08/2026 (`11` C3) e ora e' un modulo fratello, quindi non
   * c'e' piu' niente da escludere. La capacita' resta perche' il caso puo'
   * tornare — non perche' sia in uso.
   */
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
