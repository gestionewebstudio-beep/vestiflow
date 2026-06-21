import type { IsActiveMatchOptions } from '@angular/router';

/** Voce di navigazione della sidebar applicativa. */
export interface NavItem {
  readonly label: string;
  /** Classe icona PrimeIcons (es. 'pi-th-large'). */
  readonly icon: string;
  /** Route assoluta di destinazione (es. '/app/dashboard'). */
  readonly route: string;
  /** Opzioni per evidenziare la voce anche su sotto-route (es. /clients/:id). */
  readonly linkActiveOptions?: IsActiveMatchOptions;
}
