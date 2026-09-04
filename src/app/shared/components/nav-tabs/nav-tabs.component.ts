import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Una scheda della sotto-navigazione: etichetta, destinazione, e come si attiva. */
export interface NavTab {
  readonly label: string;
  /** Rotta assoluta, come vuole `check:router-links`. */
  readonly link: string;
  /**
   * ⚠️ **`exact` non è un dettaglio**: una scheda che copre anche le rotte
   * figlie (`false`) resta accesa mentre si guarda un dettaglio; una esatta si
   * spegne. Sbagliarlo accende due schede insieme, o nessuna.
   */
  readonly exact?: boolean;
}

/**
 * ⭐ **La sotto-navigazione di una feature**, in un posto solo.
 *
 * ⛔ **Era di Magazzino soltanto** (`app-inventory-tabs`), e la Cassa aveva
 * invece tre `<a>` sciolti nella testata di ogni registro, con la propria
 * regola `.ops__link` copiata anche in `.sess__link`. Tre vestiti per lo stesso
 * mestiere.
 *
 * ⚠️ **Non conosce nessun dominio**: riceve le schede e le rende. Il giorno in
 * cui qui dentro comparisse «Giacenze» o «Operazioni», sarebbe tornato a essere
 * un componente di feature travestito.
 *
 * Vive nella casella `[tabs]` di `app-list-page`, che esiste apposta: «non sono
 * filtri e non sono azioni: sono navigazione, e stanno dove l'operatore le
 * cerca».
 */
@Component({
  selector: 'app-nav-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav-tabs.component.html',
  styleUrl: './nav-tabs.component.scss',
})
export class NavTabsComponent {
  /**
   * ⚠️ **Si chiama `items`, non `tabs`, e non e` un capriccio**: `tabs` e`
   * anche l_attributo con cui `app-list-page` seleziona la propria casella,
   * e Angular lo leggerebbe come binding statico — «Type 'string' is not
   * assignable to type 'readonly NavTab[]'».
   */
  readonly items = input.required<readonly NavTab[]>();
  readonly ariaLabel = input.required<string>();
}
