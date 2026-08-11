import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { SelectMenuComponent } from '../select-menu/select-menu.component';
import type { SelectMenuOption } from '../select-menu/select-menu.model';

/**
 * Numero + Serie della testata documento.
 *
 * Il numero è proposto dal progressivo della serie ma resta editabile: un
 * numero imposto a mano non sposta il progressivo (i documenti successivi
 * ripartono dal massimo esistente + 1). La serie diventa un elenco solo se
 * ne esiste più d'una: con una sola serie configurata è una label statica,
 * senza una scelta finta da fare a ogni documento.
 */
@Component({
  selector: 'app-document-number-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SelectMenuComponent],
  templateUrl: './document-number-field.component.html',
  styleUrl: './document-number-field.component.scss',
})
export class DocumentNumberFieldComponent {
  /** Etichetta del numero: «Numero» (categoria A) o «Protocollo» (categoria B). */
  readonly numberLabel = input<string>('Numero');
  readonly numberInputId = input.required<string>();
  readonly hint = input<string>('');

  readonly number = input<number | null>(null);
  /**
   * Il numero mostrato e' una PROPOSTA (il primo libero), non un'assegnazione:
   * finche' nessuno lo tocca puo' cambiare, perche' lo prende chi salva per
   * primo. Il campo lo dice invece di far sembrare il numero gia' acquisito —
   * un operatore che lo trascrive su un documento cartaceo prima di salvare
   * scriverebbe altrimenti un numero che non sara' suo.
   *
   * Passare `false` sui documenti gia' salvati e appena l'operatore lo modifica:
   * li' il numero e' una scelta, e va difesa (vedi il conflitto sul numero).
   */
  readonly isProposal = input<boolean>(false);
  readonly series = input<string>('');
  readonly seriesOptions = input<readonly SelectMenuOption[]>([]);
  readonly disabled = input<boolean>(false);
  /**
   * Mostra l'ingranaggio «gestisci numerazioni» accanto al campo Serie. Il
   * contenitore lo abilita (permessi) e gestisce l'apertura via `manageSeries`.
   */
  readonly canManageSeries = input<boolean>(false);

  readonly numberChange = output<number | null>();
  readonly seriesChange = output<string>();
  /** Click sull'ingranaggio: il contenitore apre la gestione numerazioni. */
  readonly manageSeries = output<void>();

  /** Con una sola serie configurata il dropdown sparisce: resta la label. */
  protected readonly hasSeriesChoice = computed(() => this.seriesOptions().length > 1);

  protected readonly seriesLabel = computed(() => {
    // Il contenitore può passare il valore di un form control non ancora
    // inizializzato: si normalizza qui invece di fidarsi del binding.
    const current = (this.series() ?? '').trim();
    const match = this.seriesOptions().find((option) => option.value === current);
    return match?.label ?? current;
  });

  protected onNumberInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    if (!raw) {
      this.numberChange.emit(null);
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    this.numberChange.emit(Number.isInteger(parsed) && parsed > 0 ? parsed : null);
  }

  protected onSeriesChange(value: string | null): void {
    this.seriesChange.emit(value ?? '');
  }
}
