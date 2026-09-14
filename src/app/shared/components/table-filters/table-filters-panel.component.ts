import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import type { ElementRef } from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ColumnFilterComponent } from '@shared/components/column-filter/column-filter.component';
import { ColumnFilterStore } from '@shared/table-columns/column-filter.store';
import {
  isColumnFilterable,
  resolveColumnFilterKind,
} from '@shared/table-columns/table-column-filter.util';
import type { ColumnFilterValue } from '@shared/table-columns/column-filter.model';
import type {
  ResolvedTableColumn,
  TableColumnFilterKind,
  TableViewId,
} from '@shared/table-columns/table-column.model';

/**
 * ⭐ **La zona filtri di una tabella, nelle sue DUE vesti** (`14` §0.2,
 * `regole-stile-ui` §5 «Il pannello filtri è del TELAIO, e il contenitore è UNO»).
 *
 * ```text
 * scrivania   una riga: i filtri di dominio proiettati, e basta — i filtri di
 *             colonna vivono nelle intestazioni
 * sotto lg    un foglio laterale: gli stessi filtri di dominio, più una voce
 *             per ogni colonna filtrabile visibile, «Azzera filtri» e «Vedi risultati»
 * ```
 *
 * ⛔ **Estratta dal telaio l'11/09/2026** (`docs/26` D1). Viveva dentro
 * `app-list-page`, e le tabelle FUORI dal telaio — i due rapporti di import, le
 * non allineate del pannello Shopify, il Dettaglio inventario — avevano un
 * pulsante «Filtri» che sotto `lg` accendeva controlli nelle intestazioni, che
 * lì non esistono: **sul telefono non faceva niente**. Il proprietario ha
 * chiesto di riusare il pannello, non di nascondere la funzione.
 *
 * ⭐ **È lo stesso contenitore, con un'altra veste**: non due copie. La strada
 * ovvia — un `<ng-content>` in barra e un altro nel pannello — non funziona e
 * non fallisce (misurato il 29/08/2026: il contenuto non arriva in nessuno dei
 * due). Il contenuto proiettato si rende una volta sola.
 *
 * ⚠️ Chi lo apre è `app-table-filters-button`, con lo stesso `open` a due vie:
 * il pulsante sta nella barra, il pannello dove il chiamante lo mette, e non
 * possono essere un componente solo perché su scrivania stanno in due punti
 * diversi della stessa barra.
 */
@Component({
  selector: 'app-table-filters-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ColumnFilterComponent],
  templateUrl: './table-filters-panel.component.html',
  styleUrl: './table-filters-panel.component.scss',
  host: { class: 'table-filters-host' },
})
export class TableFiltersPanelComponent {
  private readonly document = inject(DOCUMENT);
  private readonly filterStore = inject(ColumnFilterStore);

  /**
   * ⭐ La stessa soglia che decide quale vista di riga è viva nel DOM
   * (`ViewportService`): sotto di essa non esistono intestazioni di colonna, e
   * i filtri diventano voci di un pannello.
   */
  protected readonly compatto = inject(ViewportService).compact;

  /** La vista di cui rendere i filtri di colonna. Senza, solo i filtri proiettati. */
  readonly viewId = input<TableViewId>();

  /** Aperto/chiuso del pannello compatto: lo scrive il pulsante, lo legge il pannello. */
  readonly open = model(false);

  /**
   * ⭐ **«Azzera filtri» del pannello compatto.** Esplicito, mai un effetto
   * collaterale della chiusura.
   *
   * ⛔ Chiudere il pannello NON azzera: chi apre i filtri, li imposta e preme
   * «Vedi risultati» perderebbe esattamente quello che ha appena scelto.
   */
  readonly filtersCleared = output<void>();

  private readonly pannello = viewChild<ElementRef<HTMLElement>>('pannello');

  /** Dove tornava il fuoco prima che il pannello si aprisse. */
  private readonly fuocoDaRipristinare = signal<HTMLElement | null>(null);

  constructor() {
    // Il corpo non scorre sotto il pannello aperto: è la regola dei modali.
    effect(() => {
      const aperto = this.compatto() && this.open();
      const corpo = this.document.body;

      if (aperto) {
        this.fuocoDaRipristinare.set(this.document.activeElement as HTMLElement | null);
        corpo.style.overflow = 'hidden';
        // ⚠️ Senza questo il fuoco resta sul pulsante «Filtri», dietro il
        //    pannello: chi naviga da tastiera apre e non arriva ai controlli.
        this.pannello()?.nativeElement.focus();
        return;
      }

      corpo.style.removeProperty('overflow');
      const precedente = this.fuocoDaRipristinare();
      precedente?.focus?.();
      this.fuocoDaRipristinare.set(null);
    });
  }

  protected readonly aperto = computed(() => this.compatto() && this.open());

  /**
   * ⭐ **Le colonne che portano un filtro nel PANNELLO compatto** (`14` §0.2).
   *
   * Sotto `lg` le intestazioni non esistono, quindi i controlli che su scrivania
   * vivono nella colonna diventano voci di un elenco. **Sono gli stessi
   * controlli**, con gli stessi valori: lo stato è uno solo, nello store.
   *
   * ⚠️ **Solo le colonne VISIBILI.** Colonna spenta dal selettore Colonne, filtro
   * spento: restringere l'elenco per una colonna che non si vede è peggio che non
   * poterlo fare.
   *
   * ⚠️ **Sopra `lg` non si rende affatto**, e non è un `display: none`: torna
   * vuoto. Due vesti vive insieme sono «la stessa riga due volte».
   */
  protected readonly colonneFiltrabili = computed<readonly ResolvedTableColumn[]>(() => {
    const vista = this.viewId();
    if (vista === undefined || !this.compatto()) {
      return [];
    }
    // ⭐ Le pubblica il motore tabella: qui non si conoscono le preferenze
    //    colonne, e non ci si tira dietro `AuthService` su ogni elenco.
    return this.filterStore.colonne(vista)().filter(isColumnFilterable);
  });

  protected formaFiltro(colonna: ResolvedTableColumn): TableColumnFilterKind {
    // ⚠️ Non `null`: `colonneFiltrabili()` ha già tolto le colonne senza filtro.
    return resolveColumnFilterKind(colonna) ?? 'values';
  }

  protected valoreFiltro(columnId: string): ColumnFilterValue | null {
    const vista = this.viewId();
    return vista === undefined ? null : (this.filterStore.stato(vista)()[columnId] ?? null);
  }

  protected opzioniFiltro(columnId: string): readonly string[] {
    const vista = this.viewId();
    return vista === undefined ? [] : this.filterStore.opzioniDi(vista, columnId);
  }

  protected onFiltroColonna(columnId: string, value: ColumnFilterValue | null): void {
    const vista = this.viewId();
    if (vista !== undefined) {
      this.filterStore.imposta(vista, { columnId, value });
    }
  }

  protected chiudi(): void {
    this.open.set(false);
  }

  protected azzeraFiltri(): void {
    const vista = this.viewId();
    if (vista !== undefined) {
      this.filterStore.azzera(vista);
    }
    this.filtersCleared.emit();
  }

  protected onKeydown(evento: KeyboardEvent): void {
    if (this.aperto() && evento.key === 'Escape') {
      evento.preventDefault();
      this.chiudi();
    }
  }
}
