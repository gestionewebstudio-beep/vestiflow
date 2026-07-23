import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { NavigationHistoryService } from '@core/services/navigation-history.service';
import { parentRoute } from '@core/utils/parent-route.util';

/**
 * Pulsante «← Indietro» generico sopra il titolo di pagina: torna alla pagina
 * precedente nella cronologia dell'app. Se quella cronologia non c'è — link
 * diretto, nuova scheda o refresh, che azzera le navigazioni del Router — il
 * pulsante resta e porta alla pagina padre ricavata dall'URL, invece di
 * sparire lasciando la schermata senza via d'uscita.
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

  private readonly fallback = computed(() => this.fallbackLink() ?? parentRoute(this.url()));

  /** Nascosto solo se non c'è né cronologia interna né un livello superiore. */
  protected readonly visible = computed(() => this.navHistory.canGoBack() || !!this.fallback());

  protected goBack(): void {
    if (this.navHistory.canGoBack()) {
      this.navHistory.back();
      return;
    }
    const target = this.fallback();
    if (target) {
      void this.router.navigateByUrl(target);
    }
  }
}
