import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Coppia etichetta/valore per le griglie di dettaglio. */
export interface DetailFact {
  readonly label: string;
  /** Valore già formattato; '—' per assente. */
  readonly value: string;
  /** Allinea con tabular-nums (date, importi, quantità). */
  readonly numeric?: boolean;
  /** Occupa l'intera larghezza della griglia (descrizioni, note). */
  readonly wide?: boolean;
  /** Link opzionale sotto al valore (es. admin Shopify). */
  readonly href?: string;
  readonly linkLabel?: string;
}

/**
 * Griglia chiave/valore per le pagine di dettaglio (vendite, ordini, clienti).
 * Dumb puro: solo testo già formattato. Per valori non testuali (badge, link)
 * il consumer usa markup dedicato fuori dalla griglia.
 */
@Component({
  selector: 'app-detail-facts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detail-facts.component.html',
  styleUrl: './detail-facts.component.scss',
})
export class DetailFactsComponent {
  readonly facts = input.required<readonly DetailFact[]>();
}
