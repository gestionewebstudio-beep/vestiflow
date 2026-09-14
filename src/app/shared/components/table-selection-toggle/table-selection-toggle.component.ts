import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';
import { ButtonComponent } from '@shared/components/button/button.component';

/**
 * ⭐ **«Seleziona», il pulsante della vista a card** — proprietario, 31/08/2026:
 * «bisogna inserire "Seleziona" in questi riepiloghi e credo in tutti».
 *
 * ⚠️ **Solo dove le righe sono card**: sulla tabella la selezione ce l'ha già
 * la sua colonna di caselle, e due affordance per la stessa funzione sono una
 * di troppo. Sopra `lg` non rende niente.
 *
 * ⛔ **Estratto dal telaio l'11/09/2026** (`docs/26` A6): i Codici IVA — un
 * elenco delle Impostazioni, fuori dal telaio — hanno «Duplica» nella barra
 * sulla selezione, e senza questo pulsante sul telefono non si potrebbe
 * selezionare niente. Chi lo accende passa da `createSelectionMode`, che porta
 * con sé la regola «spegnere azzera».
 */
@Component({
  selector: 'app-table-selection-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './table-selection-toggle.component.html',
  styleUrl: './table-selection-toggle.component.scss',
})
export class TableSelectionToggleComponent {
  protected readonly compatto = inject(ViewportService).compact;

  /** Acceso/spento: lo scrive questo pulsante, lo legge chi passa `rowClickSelects`. */
  readonly selectionMode = model(false);

  protected toggle(): void {
    this.selectionMode.set(!this.selectionMode());
  }
}
