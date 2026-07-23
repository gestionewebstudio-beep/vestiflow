import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { NavigationHistoryService } from '@core/services/navigation-history.service';
import { parentRoute } from '@core/utils/parent-route.util';

/** Ultima spiaggia: da qualunque pagina la freccia porta almeno alla home. */
const ROOT_FALLBACK = '/app/dashboard';

/**
 * Pulsante «← Indietro» generico sopra il titolo di pagina: torna alla pagina
 * precedente nella cronologia dell'app. Se quella cronologia non c'è — link
 * diretto, nuova scheda o refresh, che azzera le navigazioni del Router — NON
 * sparisce: porta alla pagina padre ricavata dall'URL, oppure, per le pagine
 * di primo livello che un padre non ce l'hanno, alla dashboard. Così non resta
 * mai una schermata senza via d'uscita in-app.
 */
@Component({
  selector: 'app-back-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './back-button.component.html',
  styleUrl: './back-button.component.scss',
})
export class BackButtonComponent {
  /** Rotta di ritorno esplicita, quando quella dedotta dall'URL non basta. */
  readonly fallbackLink = input<string | null>(null);

  private readonly navHistory = inject(NavigationHistoryService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Destinazione quando manca la cronologia: prima il link esplicito, poi il
   * padre dedotto dall'URL, infine la dashboard. Non è mai nullo, quindi la
   * freccia resta sempre visibile e cliccabile anche dopo un refresh.
   */
  private readonly fallback = computed(
    () => this.fallbackLink() ?? parentRoute(this.url()) ?? ROOT_FALLBACK,
  );

  protected goBack(): void {
    if (this.navHistory.canGoBack()) {
      this.navHistory.back();
      return;
    }
    void this.router.navigateByUrl(this.fallback());
  }
}
