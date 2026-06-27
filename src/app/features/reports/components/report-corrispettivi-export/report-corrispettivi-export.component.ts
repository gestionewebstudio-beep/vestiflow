import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { ReportPeriodPreset } from '../../models/report-list-query.model';

/** Card export corrispettivi con filtri periodo e tipologia (dumb). */
@Component({
  selector: 'app-report-corrispettivi-export',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, DateInputComponent, SelectMenuComponent],
  templateUrl: './report-corrispettivi-export.component.html',
  styleUrl: './report-corrispettivi-export.component.scss',
})
export class ReportCorrispettiviExportComponent {
  readonly period = input.required<ReportPeriodPreset>();
  readonly dateFrom = input<string>('');
  readonly dateTo = input<string>('');
  readonly channel = input.required<string>();
  readonly channelOptions = input.required<readonly SelectMenuOption[]>();
  readonly channelHint = input.required<string>();
  readonly periodLabel = input.required<string>();
  readonly exporting = input<boolean>(false);

  readonly periodChange = output<ReportPeriodPreset>();
  readonly dateFromChange = output<string>();
  readonly dateToChange = output<string>();
  readonly channelChange = output<string>();
  readonly exportClick = output<void>();

  protected readonly showCustomDates = computed(() => this.period() === ReportPeriodPreset.Custom);

  protected readonly periodOptions: readonly SelectMenuOption[] = [
    { value: ReportPeriodPreset.Last7Days, label: 'Ultimi 7 giorni' },
    { value: ReportPeriodPreset.Last30Days, label: 'Ultimi 30 giorni' },
    { value: ReportPeriodPreset.ThisMonth, label: 'Mese corrente' },
    { value: ReportPeriodPreset.LastMonth, label: 'Mese scorso' },
    { value: ReportPeriodPreset.ThisYear, label: 'Anno corrente' },
    { value: ReportPeriodPreset.Custom, label: 'Personalizzato' },
  ];

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
