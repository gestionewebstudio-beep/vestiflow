import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { SalesOrderFinancialStatus, SalesOrderSource } from '@core/models/sales-order.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { ReportPeriodPreset } from '../../models/report-list-query.model';

/** Barra filtri report vendite (dumb). */
@Component({
  selector: 'app-report-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, SelectMenuComponent],
  templateUrl: './report-filters.component.html',
  styleUrl: './report-filters.component.scss',
})
export class ReportFiltersComponent {
  readonly period = input.required<ReportPeriodPreset>();
  readonly dateFrom = input<string>('');
  readonly dateTo = input<string>('');
  readonly source = input<string>('');
  readonly financialStatus = input<string>('');
  readonly hasActiveFilters = input<boolean>(false);

  readonly periodChange = output<ReportPeriodPreset>();
  readonly dateFromChange = output<string>();
  readonly dateToChange = output<string>();
  readonly sourceChange = output<string>();
  readonly financialStatusChange = output<string>();
  readonly resetFilters = output<void>();

  protected readonly ReportPeriodPreset = ReportPeriodPreset;
  protected readonly showCustomDates = computed(() => this.period() === ReportPeriodPreset.Custom);

  protected readonly periodOptions: readonly SelectMenuOption[] = [
    { value: ReportPeriodPreset.Last7Days, label: 'Ultimi 7 giorni' },
    { value: ReportPeriodPreset.Last30Days, label: 'Ultimi 30 giorni' },
    { value: ReportPeriodPreset.ThisMonth, label: 'Mese corrente' },
    { value: ReportPeriodPreset.LastMonth, label: 'Mese scorso' },
    { value: ReportPeriodPreset.ThisYear, label: 'Anno corrente' },
    { value: ReportPeriodPreset.Custom, label: 'Personalizzato' },
  ];

  protected readonly financialStatusOptions: readonly SelectMenuOption[] = [
    { value: SalesOrderFinancialStatus.Pending, label: 'In attesa' },
    { value: SalesOrderFinancialStatus.Paid, label: 'Pagato' },
    { value: SalesOrderFinancialStatus.PartiallyRefunded, label: 'Rimborso parziale' },
    { value: SalesOrderFinancialStatus.Refunded, label: 'Rimborsato' },
    { value: SalesOrderFinancialStatus.Voided, label: 'Annullato' },
  ];

  protected readonly sourceOptions: readonly SelectMenuOption[] = [
    { value: SalesOrderSource.Online, label: 'Online' },
    { value: SalesOrderSource.Pos, label: 'Negozio' },
  ];

  protected onPeriodChange(value: string | null): void {
    if (value && this.isPeriodPreset(value)) {
      this.periodChange.emit(value);
    }
  }

  protected onSourceChange(value: string | null): void {
    this.sourceChange.emit(value ?? '');
  }

  protected onFinancialStatusChange(value: string | null): void {
    this.financialStatusChange.emit(value ?? '');
  }

  protected onDateFromInput(event: Event): void {
    this.dateFromChange.emit((event.target as HTMLInputElement).value);
  }

  protected onDateToInput(event: Event): void {
    this.dateToChange.emit((event.target as HTMLInputElement).value);
  }

  private isPeriodPreset(value: string): value is ReportPeriodPreset {
    return (Object.values(ReportPeriodPreset) as string[]).includes(value);
  }
}
