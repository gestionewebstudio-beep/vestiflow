import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ColumnFilterStore } from '@shared/table-columns/column-filter.store';
import type { TableViewId } from '@shared/table-columns/table-column.model';

/**
 * ⭐ **Il pulsante «Filtri» di una tabella — un pulsante, due mestieri, perché
 * sono due vesti e non due funzioni** (`14` §0.2):
 *
 * ```text
 * scrivania   accende i controlli di filtro nelle INTESTAZIONI di colonna
 * sotto lg    apre il PANNELLO (`app-table-filters-panel`): lì le intestazioni non esistono
 * ```
 *
 * ⚠️ Gli stati sono **due segnali distinti**, e non è un dettaglio: sotto `lg`
 * il pulsante apre e chiude, e chiudere non deve azzerare niente; su scrivania
 * spegnere **è** azzerare. Un segnale solo darebbe l'uno o l'altro
 * comportamento a entrambe le vesti.
 *
 * ⛔ **Estratto dal telaio l'11/09/2026** (`docs/26` D1) insieme al pannello:
 * quattro schermate fuori dal telaio avevano ciascuna un proprio «Filtri» che
 * conosceva solo la veste da scrivania.
 */
@Component({
  selector: 'app-table-filters-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './table-filters-button.component.html',
  styleUrl: './table-filters-button.component.scss',
  host: { class: 'table-filters-button-host' },
})
export class TableFiltersButtonComponent {
  private readonly filterStore = inject(ColumnFilterStore);
  protected readonly compatto = inject(ViewportService).compact;

  /** La vista di cui accendere e contare i filtri di colonna. */
  readonly viewId = input<TableViewId>();

  /**
   * Quanti filtri di DOMINIO sono attivi adesso: si sommano a quelli di colonna
   * e diventano «Filtri (2)». Un elenco può avere entrambi finché la migrazione
   * ai filtri di colonna non è finita.
   */
  readonly activeFilterCount = input(0);

  /** Aperto/chiuso del pannello compatto: lo condivide con `app-table-filters-panel`. */
  readonly open = model(false);

  /**
   * ⭐ «Lo spegnimento È l'azzeramento». Su scrivania questo pulsante ha PRESO
   * IL POSTO di «Azzera filtri»: se spegnere non azzerasse, l'azzeramento non
   * esisterebbe più da nessuna parte. L'evento resta per i filtri di DOMINIO,
   * che la pagina possiede ancora.
   */
  readonly filtersCleared = output<void>();

  /**
   * ⚠️ **Il ripiego per una tabella senza vista di colonne**: l'interruttore
   * resta un segnale locale invece di non esistere, così il pulsante non si
   * comporta in due modi diversi a seconda della pagina.
   */
  private readonly filtriLocali = signal(false);

  protected readonly filtersOn = computed(() => {
    const vista = this.viewId();
    return vista === undefined ? this.filtriLocali() : this.filterStore.acceso(vista)();
  });

  /** Il numero del badge: dominio + colonne. Contare da una parte sola direbbe «nessun filtro» a un elenco ristretto. */
  protected readonly conteggio = computed(() => {
    const vista = this.viewId();
    const colonne = vista === undefined ? 0 : this.filterStore.conteggio(vista)();
    return this.activeFilterCount() + colonne;
  });

  protected toggle(): void {
    if (this.compatto()) {
      this.open.set(!this.open());
      return;
    }

    const vista = this.viewId();
    if (vista === undefined) {
      this.filtriLocali.set(!this.filtriLocali());
    } else {
      // ⭐ Accende, spegne, e **spegnendo azzera i filtri di colonna**: la regola
      //    sta nello store, dove stanno i valori, e non in questo pulsante.
      this.filterStore.commuta(vista);
    }

    if (!this.filtersOn()) {
      this.filtersCleared.emit();
    }
  }
}
