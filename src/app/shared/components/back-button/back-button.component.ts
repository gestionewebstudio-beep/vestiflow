import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { NavigationHistoryService } from '@core/services/navigation-history.service';

/**
 * Pulsante «← Indietro» generico sopra il titolo di pagina: torna alla pagina
 * precedente nella cronologia del browser. Si nasconde quando non c'è una
 * pagina precedente nella sessione dell'app (apertura da link diretto o nuova
 * scheda), evitando di uscire dall'app.
 */
@Component({
  selector: 'app-back-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './back-button.component.html',
  styleUrl: './back-button.component.scss',
})
export class BackButtonComponent {
  protected readonly navHistory = inject(NavigationHistoryService);
}
