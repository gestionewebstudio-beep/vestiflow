import type { IsActiveMatchOptions } from '@angular/router';

/** Voce di navigazione della sidebar applicativa. */
export interface NavItem {
  readonly label: string;
  /** Classe icona PrimeIcons (es. 'pi-th-large'). */
  readonly icon: string;
  /** Route assoluta di destinazione (es. '/app/dashboard'). */
  readonly route: string;
  /**
   * Prefisso usato per evidenziare la voce su tutte le sotto-route della sezione
   * (es. '/app/inventory' quando `route` punta a '/app/inventory/lookup').
   */
  readonly activeRoutePrefix?: string;
  /** Route escluse dall'evidenza (es. '/app/sales/register' per la voce Vendite). */
  readonly activeRouteExclude?: readonly string[];
  /** Opzioni legacy per evidenziare la voce; preferire activeRoutePrefix. */
  readonly linkActiveOptions?: IsActiveMatchOptions;
}
