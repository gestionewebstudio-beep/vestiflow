import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { periodNeedsYear, ReportPeriodPreset } from '../../models/report-list-query.model';

/** Anno corrente più i cinque precedenti, dal più recente. */
function defaultYearOptions(): readonly SelectMenuOption[] {
  const current = new Date().getUTCFullYear();
  return Array.from({ length: 6 }, (_, index) => {
    const year = current - index;
    return { value: String(year), label: String(year) };
  });
}

/** Card export corrispettivi con filtri periodo e tipologia opzionale (dumb). */
@Component({
  selector: 'app-report-corrispettivi-export',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, DateInputComponent, SelectMenuComponent],
  templateUrl: './report-corrispettivi-export.component.html',
  styleUrl: './report-corrispettivi-export.component.scss',
})
export class ReportCorrispettiviExportComponent {
  readonly title = input('Export corrispettivi');
  readonly subtitle = input(
    'Elenco vendite e storni per il commercialista, filtrato per periodo e canale di vendita.',
  );
  readonly exportButtonLabel = input('Esporta corrispettivi');
  readonly showExportButton = input(true);
  readonly showChannelFilter = input(true);

  readonly period = input.required<ReportPeriodPreset>();
  readonly dateFrom = input<string>('');
  readonly dateTo = input<string>('');
  readonly year = input<number | undefined>(undefined);
  readonly month = input<number | undefined>(undefined);
  readonly quarter = input<number | undefined>(undefined);
  readonly channel = input<string>('');
  readonly channelOptions = input<readonly SelectMenuOption[]>([]);
  readonly channelHint = input<string>('');
  readonly periodLabel = input.required<string>();
  readonly exporting = input<boolean>(false);

  readonly periodChange = output<ReportPeriodPreset>();
  readonly dateFromChange = output<string>();
  readonly dateToChange = output<string>();
  readonly yearChange = output<number>();
  readonly monthChange = output<number>();
  readonly quarterChange = output<number>();
  readonly channelChange = output<string>();
  readonly exportClick = output<void>();

  /**
   * I selettori secondari compaiono **solo** per il periodo che li richiede.
   *
   * È ciò che impedisce le combinazioni prive di senso: «mese corrente» non ha
   * un anno da scegliere, e infatti non lo mostra. Chi vuole un mese storico
   * sceglie «Mese», e allora — e solo allora — compaiono mese e anno.
   */
  protected readonly showCustomDates = computed(() => this.period() === ReportPeriodPreset.Custom);
  protected readonly showMonthPicker = computed(
    () => this.period() === ReportPeriodPreset.CalendarMonth,
  );
  protected readonly showQuarterPicker = computed(
    () => this.period() === ReportPeriodPreset.CalendarQuarter,
  );
  protected readonly showYearPicker = computed(() => periodNeedsYear(this.period()));

  // Il menu lavora su stringhe; i valori restano numeri nel modello.
  protected readonly monthValue = computed(() => (this.month() ? String(this.month()) : ''));
  protected readonly quarterValue = computed(() => (this.quarter() ? String(this.quarter()) : ''));
  protected readonly yearValue = computed(() => (this.year() ? String(this.year()) : ''));

  protected readonly periodOptions: readonly SelectMenuOption[] = [
    { value: ReportPeriodPreset.Last7Days, label: 'Ultimi 7 giorni' },
    { value: ReportPeriodPreset.Last30Days, label: 'Ultimi 30 giorni' },
    { value: ReportPeriodPreset.ThisMonth, label: 'Mese corrente' },
    { value: ReportPeriodPreset.LastMonth, label: 'Mese scorso' },
    { value: ReportPeriodPreset.ThisYear, label: 'Anno corrente' },
    { value: ReportPeriodPreset.CalendarMonth, label: 'Mese…' },
    { value: ReportPeriodPreset.CalendarQuarter, label: 'Trimestre…' },
    { value: ReportPeriodPreset.CalendarYear, label: 'Anno…' },
    { value: ReportPeriodPreset.Custom, label: 'Personalizzato' },
  ];

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

  /**
   * Gli anni proposti. Cinque indietro coprono i termini di conservazione
   * ordinari; chi deve andare più lontano usa Personalizzato.
   */
  readonly yearOptions = input<readonly SelectMenuOption[]>(defaultYearOptions());

  protected onYearChange(value: string | null): void {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      this.yearChange.emit(parsed);
    }
  }

  protected onMonthChange(value: string | null): void {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      this.monthChange.emit(parsed);
    }
  }

  protected onQuarterChange(value: string | null): void {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      this.quarterChange.emit(parsed);
    }
  }

  protected onPeriodChange(value: string | null): void {
    if (value && this.isPeriodPreset(value)) {
      this.periodChange.emit(value);
    }
  }

  protected onChannelChange(value: string | null): void {
    this.channelChange.emit(value ?? '');
  }

  protected onDateFromChange(value: string): void {
    this.dateFromChange.emit(value);
  }

  protected onDateToChange(value: string): void {
    this.dateToChange.emit(value);
  }

  private isPeriodPreset(value: string): value is ReportPeriodPreset {
    return (Object.values(ReportPeriodPreset) as string[]).includes(value);
  }
}
