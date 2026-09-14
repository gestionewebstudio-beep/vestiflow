import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { PeriodFilterOption, PeriodFilterPicker } from './period-filter.model';

/**
 * ⭐ **Il selettore Periodo di un elenco, uno solo** — deciso dal proprietario
 * l'11/09/2026: _«il filtro del periodo giusto è quello che si trova in
 * Corrispettivi: riutilizzarlo senza duplicare»_.
 *
 * È il controllo del Registro Corrispettivi estratto com'era: il selettore a
 * larghezza stabile (`fitContent`, mai `filterChip` — un periodo ha SEMPRE un
 * valore, e una × che lo cancella è un filtro che sembra spento), i selettori
 * di Mese / Trimestre / Anno che compaiono solo con i preset di calendario, la
 * giornata singola, e la coppia Dal/Al che compare con «Personalizzato».
 *
 * ## ⛔ Condivide il CONTROLLO, non le regole dei periodi
 *
 * _«Si condivide il selettore, senza cambiare automaticamente le regole dei
 * periodi. Un componente comune può avere opzioni diverse per schermata senza
 * essere duplicato.»_ Quindi:
 *
 * - **le voci le passa la schermata** (`options`), con i selettori che ogni voce
 *   fa comparire (`pickers`): «Tutti» resta dove c'era, «Giorno specifico…» e
 *   «Mese…» stanno dove il risolutore della schermata li sa risolvere;
 * - **il significato di una voce resta di chi la risolve**: qui non c'è nessuna
 *   aritmetica di date, nessun «oggi», nessun fuso. Il componente emette il
 *   valore scelto e le date scritte, e la schermata li traduce con il proprio
 *   risolutore — `resolveReportDateRange` o `resolveMovementPeriodRange`, che
 *   NON coincidono (giorno UTC contro giorno di attività, mese fino a oggi
 *   contro mese intero) e non vanno unificati di nascosto;
 * - **la modalità di visualizzazione è della schermata**: `datesAlways` tiene la
 *   coppia Dal/Al sempre visibile (la Cassa, i registri documentali), altrove
 *   compare solo quando il preset la chiede.
 *
 * ⚠️ **È un componente dumb**: nessuno stato proprio. `value`, date, mese,
 * trimestre e anno arrivano da fuori e ogni modifica esce da un `output`. La
 * schermata resta la sola a scrivere i propri parametri di rotta.
 */
@Component({
  selector: 'app-period-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SelectMenuComponent, DateInputComponent],
  templateUrl: './period-filter.component.html',
  styleUrl: './period-filter.component.scss',
})
export class PeriodFilterComponent {
  // ── INPUT ─────────────────────────────────────────────────────────────────
  /** Le voci della schermata, con i selettori che ciascuna fa comparire. */
  readonly options = input.required<readonly PeriodFilterOption[]>();
  /** Prefisso degli `id` dei campi data: due selettori nella stessa pagina non li condividono. */
  readonly idPrefix = input.required<string>();
  readonly value = input<string | null>(null);
  readonly ariaLabel = input<string>('Filtra per periodo');
  readonly chipLabel = input<string>('Periodo');
  readonly placeholder = input<string>('Periodo');
  /** YYYY-MM-DD, o vuoto. */
  readonly dateFrom = input<string>('');
  readonly dateTo = input<string>('');
  /** La giornata singola, YYYY-MM-DD. */
  readonly day = input<string>('');
  /** Mese 1-12, trimestre 1-4, anno: come stringhe, vuote se non scelti. */
  readonly month = input<string>('');
  readonly quarter = input<string>('');
  readonly year = input<string>('');
  /**
   * La coppia Dal/Al sempre visibile, qualunque sia il preset. È la forma della
   * Cassa (06/09/2026) e dei registri documentali; altrove la coppia compare
   * solo con il preset che la chiede.
   */
  readonly datesAlways = input<boolean>(false);

  // ── OUTPUT ────────────────────────────────────────────────────────────────
  readonly valueChange = output<string | null>();
  readonly dayChange = output<string>();
  readonly dateFromChange = output<string>();
  readonly dateToChange = output<string>();
  readonly monthChange = output<string>();
  readonly quarterChange = output<string>();
  readonly yearChange = output<string>();

  // ── COMPUTED ──────────────────────────────────────────────────────────────
  private readonly pickers = computed<readonly PeriodFilterPicker[]>(
    () => this.options().find((option) => option.value === (this.value() ?? ''))?.pickers ?? [],
  );

  protected readonly showDay = computed(() => this.pickers().includes('day'));
  protected readonly showMonth = computed(() => this.pickers().includes('month'));
  protected readonly showQuarter = computed(() => this.pickers().includes('quarter'));
  protected readonly showYear = computed(() => this.pickers().includes('year'));
  protected readonly showRange = computed(
    () => this.datesAlways() || this.pickers().includes('range'),
  );

  protected readonly monthOptions: readonly SelectMenuOption[] = [
    'Gennaio',
    'Febbraio',
    'Marzo',
    'Aprile',
    'Maggio',
    'Giugno',
    'Luglio',
    'Agosto',
    'Settembre',
    'Ottobre',
    'Novembre',
    'Dicembre',
  ].map((label, index) => ({ value: String(index + 1), label }));

  protected readonly quarterOptions: readonly SelectMenuOption[] = [
    { value: '1', label: '1° trimestre' },
    { value: '2', label: '2° trimestre' },
    { value: '3', label: '3° trimestre' },
    { value: '4', label: '4° trimestre' },
  ];

  /** Cinque anni indietro coprono la conservazione ordinaria. */
  protected readonly yearOptions: readonly SelectMenuOption[] = Array.from(
    { length: 6 },
    (_unused, index) => {
      const anno = new Date().getUTCFullYear() - index;
      return { value: String(anno), label: String(anno) };
    },
  );
}
