import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';

import type { DocumentType } from '@core/models/document.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import type { DocumentCounterView } from '../../models/document-counter.model';
import { documentTypeLabel } from '../../models/document-labels.util';
import { documentNumberingType } from '../../models/document-numbering.util';
import { DocumentCountersService } from '../../services/document-counters.service';
import { DocumentCountersComponent } from '../document-counters/document-counters.component';

/**
 * Gestione numerazioni di UN tipo documento, aperta come pannello sopra la
 * maschera del documento in compilazione (l'ingranaggio accanto al campo Serie).
 * Riusa `app-document-counters` — lo stesso componente delle Impostazioni —
 * filtrato sul tipo corrente, non una versione ridotta. Il documento resta
 * montato: aprire e chiudere il pannello non perde nulla di quanto compilato.
 * Alla chiusura il contenitore ricarica l'elenco serie del documento.
 */
@Component({
  selector: 'app-document-series-manager-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SlidePanelComponent, DocumentCountersComponent, TableSkeletonComponent],
  templateUrl: './document-series-manager-dialog.component.html',
  styleUrl: './document-series-manager-dialog.component.scss',
})
export class DocumentSeriesManagerDialogComponent {
  private readonly countersService = inject(DocumentCountersService);
  private readonly destroyRef = inject(DestroyRef);

  readonly type = input.required<DocumentType>();
  readonly open = input<boolean>(false);

  readonly closed = output<void>();

  /**
   * Il tipo che possiede il numeratore. Il pannello parla di CONTATORI, e un
   * contatore esiste solo per quel tipo: aperto da una Fattura accompagnatoria
   * mostrava zero righe (filtro sul tipo grezzo) e un contatore creato lì
   * sarebbe stato rifiutato con 422. Il titolo segue il numeratore perché è
   * quello che l'operatore sta davvero configurando.
   */
  protected readonly numberingType = computed(() => documentNumberingType(this.type()));

  protected readonly title = computed(
    () => `Numerazioni · ${documentTypeLabel(this.numberingType())}`,
  );

  private readonly _counters = signal<readonly DocumentCounterView[]>([]);
  protected readonly counters = this._counters.asReadonly();
  private readonly _loading = signal(false);
  protected readonly loading = this._loading.asReadonly();

  constructor() {
    // Carica (o ricarica) i contatori del tipo ogni volta che il pannello si
    // apre, così mostra sempre lo stato aggiornato delle serie.
    effect(() => {
      if (this.open()) {
        this.reload();
      }
    });
  }

  /**
   * Ricarica i contatori del tipo (all'apertura e dopo ogni mutazione). Come le
   * Impostazioni, mostra TUTTE le serie del tipo (ogni sede), non filtrate per
   * la sede del documento: `list()` + filtro per numeratore.
   */
  protected reload(): void {
    this._loading.set(true);
    const type = this.numberingType();
    this.countersService
      .list()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (all) => {
          this._counters.set(all.filter((counter) => counter.type === type));
          this._loading.set(false);
        },
        error: () => this._loading.set(false),
      });
  }

  protected onClosed(): void {
    this.closed.emit();
  }
}
