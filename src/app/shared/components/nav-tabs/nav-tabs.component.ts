import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, startWith } from 'rxjs';

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
  /**
   * ⭐ La PAROLA DI STATO accanto al nome, in maiuscoletto tenue («conclusa»,
   *    «limitata»): serve a scegliere la scheda senza aprirla (proprietario,
   *    13/09/2026, sul mock delle schede Shopify). Facoltativa.
   */
  readonly stato?: string;
  /** Il colore della parola di stato: neutro se non dichiarato. */
  readonly tono?: 'neutral' | 'success' | 'warning' | 'info';
  /** Un CONTEGGIO a pastiglia («82» problemi): ambra se maggiore di zero, neutro a zero. */
  readonly conteggio?: number;
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

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // ⭐ Sul telefono le schede scorrono, e quella attiva può stare fuori vista: a ogni
    //    navigazione la si porta dentro. Dopo un giro di eventi, perché `routerLinkActive`
    //    assegna la classe in un microtask successivo a `NavigationEnd`.
    let attesa: ReturnType<typeof setTimeout> | null = null;
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (attesa !== null) {
          clearTimeout(attesa);
        }
        attesa = setTimeout(() => {
          attesa = null;
          const attiva =
            this.host.nativeElement.querySelector<HTMLElement>('.nav-tabs__link--active');
          if (attiva && typeof attiva.scrollIntoView === 'function') {
            attiva.scrollIntoView({ inline: 'nearest', block: 'nearest' });
          }
        }, 0);
      });
    this.destroyRef.onDestroy(() => {
      if (attesa !== null) {
        clearTimeout(attesa);
      }
    });
  }
}
