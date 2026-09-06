import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { DocumentLineSelectCellComponent } from '../document-line-select-cell/document-line-select-cell.component';

/** L'etichetta della voce-comando in coda alla tendina (specifica §4.3). */
export const UNIT_OF_MEASURE_MANAGE_LABEL = '» Altro…';

/**
 * La cella **unità di misura** di una riga documento: la cella a
 * ricerca-e-selezione (§4.3) con le due cose che l'U.M. porta con sé e l'IVA no.
 *
 * - **testo libero ammesso.** L'insieme è aperto — pz, conf, paio, mazzo — e la
 *   tabella suggerisce, non obbliga. Quello che si digita resta anche se non è
 *   in elenco: sulla riga l'unità è una stringa, e nessuna chiave esterna la
 *   sorveglia.
 * - **il comando «» Altro…»**, che chiede di aprire la gestione delle voci.
 *   Chiede, non apre: è un `output`, e il pannello sta **una volta sola** nella
 *   maschera. Montandolo qui dentro ce ne sarebbe uno per riga — trenta pannelli
 *   in un documento da trenta righe, tutti chiusi tranne al più uno.
 *
 * **Muta come le altre celle di riga**: riceve le voci, non se le carica. Chi le
 * carica è la maschera, una volta per documento; e senza quel vincolo questa
 * cella non potrebbe stare dentro le card, che sono dumb per contratto.
 *
 * **Su mobile è la stessa cella**, col Tab lasciato al browser
 * (`inColumnCycle` a `false`): l'elenco si apre, si filtra e si sceglie
 * toccando.
 */
@Component({
  selector: 'app-document-line-unit-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DocumentLineSelectCellComponent],
  templateUrl: './document-line-unit-cell.component.html',
})
export class DocumentLineUnitCellComponent {
  readonly lineIndex = input.required<number>();
  readonly inputId = input('');
  readonly value = input('');
  /** Le unità attive del tenant, già in forma di opzione. */
  readonly options = input<readonly SelectMenuOption[]>([]);
  readonly disabled = input(false);
  readonly inColumnCycle = input(true);
  readonly ariaLabel = input('Unità di misura');

  readonly valueChange = output<string>();
  readonly manageRequested = output<void>();
  readonly lineAdvance = output<number>();
  readonly lineRetreat = output<number>();
  readonly lineRowAdvance = output<number>();
  readonly lineRowRetreat = output<number>();

  protected readonly manageLabel = UNIT_OF_MEASURE_MANAGE_LABEL;
}
