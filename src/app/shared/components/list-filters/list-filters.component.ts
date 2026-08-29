import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';

import {
  countActiveListFilters,
  listFilterChecked,
  listFilterValue,
  type ListFilterDef,
  type ListFilterValues,
} from './list-filter.model';

/**
 * **Il contenitore comune dei filtri di elenco** (`14` §11, §17.2, §17.3, §19).
 *
 * La pagina dichiara i filtri **una volta**; questo componente li rende inline
 * sul desktop e dentro un solo `SlidePanel` sul mobile. Stessi valori, stessi
 * handler, stessi query param: cambia soltanto la veste.
 *
 * ⛔ **Una sola rappresentazione attiva** (`14` §17.4). Le due vesti sono in
 * rami `@if` sul viewport, non nascoste con `display: none`: la stessa riga non
 * deve esistere in due DOM attivi sulla stessa finestra, o uno screen reader la
 * annuncia due volte e il Tab ci passa due volte.
 *
 * ⚠️ **Il contenitore non possiede lo stato.** Emette `filterChange` e la pagina
 * decide: è lei che possiede i query param e la richiesta. Un contenitore che
 * tenesse lo stato costringerebbe ogni consumer a sincronizzarne due.
 */
@Component({
  selector: 'app-list-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, DateInputComponent, SelectMenuComponent, SlidePanelComponent],
  templateUrl: './list-filters.component.html',
  styleUrl: './list-filters.component.scss',
})
export class ListFiltersComponent {
  private readonly viewport = inject(ViewportService);

  readonly filters = input.required<readonly ListFilterDef[]>();
  readonly values = input.required<ListFilterValues>();
  /**
   * Il pannello mobile è aperto?
   *
   * ⚠️ Lo possiede la PAGINA, non questo componente: su schermo compatto il
   * pannello ospita anche controlli che il contenitore non conosce — Raggruppa,
   * i comandi di vista — e due sorgenti di apertura darebbero due pannelli.
   */
  readonly panelOpen = input(false);
  /**
   * «Azzera filtri» è visibile?
   *
   * ⛔ **Lo decide il CONSUMER**, e non è pigrizia: la condizione di oggi
   * include la RICERCA libera (`hasActiveFilters()`), che il contenitore non
   * conosce e non deve conoscere — la ricerca resta separata dai filtri
   * (`14` §11, §19). Calcolarla qui la farebbe sparire dove oggi compare.
   */
  readonly resetVisible = input(true);

  readonly panelOpenChange = output<boolean>();
  /**
   * «Azzera filtri»: la RICHIESTA, non le modifiche.
   *
   * ⛔ Il come lo esegue la pagina: dipende dal profilo e dall'aritmetica dei
   *    periodi, che il contenitore comune non conosce (vedi il modello).
   */
  readonly resetRequested = output<void>();

  /** ⭐ La soglia è quella comune del progetto, non una scritta qui. */
  protected readonly compact = this.viewport.compact;

  /** Il numero del badge «Filtri (n)»: solo le restrizioni opzionali (`14` §19). */
  protected readonly activeCount = computed(() =>
    countActiveListFilters(this.filters(), this.values()),
  );

  protected readonly filtersLabel = computed(() => {
    const n = this.activeCount();
    return n > 0 ? `Filtri (${n})` : 'Filtri';
  });

  protected value(key: string): string {
    return listFilterValue(this.values(), key);
  }

  protected checked(key: string): boolean {
    return listFilterChecked(this.values(), key);
  }

  protected onCheckedChange(filtro: ListFilterDef, event: Event): void {
    filtro.onCheckedChange?.((event.target as HTMLInputElement).checked);
  }

  /**
   * ⛔ I campi Dal/Al si mostrano se lo dice il CONSUMER.
   *
   * Il contenitore non deduce niente dal preset: `document-list` li mostra
   * sempre tranne che sull'Arrivo merce, e quella condizione è sua.
   */
  protected showsRange(filtro: ListFilterDef): boolean {
    return filtro.kind === 'period' && filtro.showDateRange === true;
  }

  /**
   * ⚠️ La stringa vuota diventa `null`: è la forma che gli handler della pagina
   *    ricevono già oggi da `app-select-menu`, e cambiarla cambierebbe gli URL.
   */
  protected onFilterChange(filtro: ListFilterDef, value: string | null): void {
    filtro.onChange?.(value === '' ? null : value);
  }

  protected onPresetChange(filtro: ListFilterDef, value: string | null): void {
    filtro.onPresetChange?.(value === '' ? null : value);
  }

  protected onFromChange(filtro: ListFilterDef, value: string): void {
    filtro.onFromChange?.(value);
  }

  protected onToChange(filtro: ListFilterDef, value: string): void {
    filtro.onToChange?.(value);
  }

  protected openPanel(): void {
    this.panelOpenChange.emit(true);
  }

  protected closePanel(): void {
    this.panelOpenChange.emit(false);
  }

  protected onReset(): void {
    this.resetRequested.emit();
  }
}
