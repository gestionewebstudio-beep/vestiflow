import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';

/**
 * **Un campo della testata documento**, in tutte e due le vesti.
 *
 * ⛔ Qui c'era il difetto più grosso della schermata: ogni maschera scriveva i
 * propri campi **due volte** — una nella griglia desktop e una nel pannello
 * mobile. Sul Trasferimento erano 74 righe contro 78: stessi quattro campi,
 * stesse opzioni, stessi gestori; cambiavano l'identificativo e la formula
 * dell'`aria-label`. Misurato il 24/08/2026 su otto maschere: **2.152 righe di
 * testata su 7.240 totali, e metà erano la seconda copia dell'altra metà**.
 *
 * ⚠️ Non era una vista diversa: era la stessa vista scritta due volte, dentro
 * la stessa maschera. E ogni correzione ne raggiungeva una sola.
 *
 * ⭐ **Il campo si dichiara una volta.** Le classi cambiano da sole con la
 * larghezza — `doc-form__field` di là, `doc-panel__field` di qua — perché il
 * campo chiede al viewport, non al chiamante.
 *
 * ⚠️ E gli identificativi tornano **unici**: prima ne esistevano due per lo
 * stesso campo (`tr-origin-error` e `tr-m-origin-error`), uno dei quali sempre
 * in una vista non renderizzata.
 */
@Component({
  selector: 'app-document-header-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classi()',
    '[class.doc-form__field--span2]': 'span2() && !compatto()',
    '[class.doc-form__field--waiting]': 'waiting()',
  },
  template: `
    <span [class]="compatto() ? 'doc-panel__label' : 'doc-form__label'">{{ label() }}</span>
    <ng-content />
    @if (invalid()) {
      <p [id]="errorId()" class="doc-form__error">{{ errorMessage() }}</p>
    }
  `,
})
export class DocumentHeaderFieldComponent {
  private readonly viewport = inject(ViewportService);

  readonly label = input.required<string>();
  /** Il campo principale occupa due colonne: Cliente, Fornitore. */
  readonly span2 = input(false);
  /**
   * Obbligatorio e ancora vuoto: si segna col colore del **campo in attesa**,
   * non col rosso dell'errore — aprire un documento nuovo non è uno sbaglio.
   */
  readonly waiting = input(false);
  readonly invalid = input(false);
  /** L'identificativo che il controllo dentro cita in `describedBy`. */
  readonly errorId = input('');
  /**
   * ⚠️ Il messaggio NON ripete il segnaposto: un campo che dice «Seleziona un
   * fornitore…» e sotto «Seleziona un fornitore.» è la stessa frase due volte a
   * quaranta pixel di distanza (`regole-stile-ui` §5).
   */
  readonly errorMessage = input('Campo obbligatorio.');

  protected readonly compatto = this.viewport.compact;

  protected readonly classi = computed(() =>
    this.compatto() ? 'doc-panel__field' : 'doc-form__field',
  );
}
