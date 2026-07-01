import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { ReportPeriodPreset } from '../../models/report-list-query.model';

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
  readonly channel = input<string>('');
  readonly channelOptions = input<readonly SelectMenuOption[]>([]);
  readonly channelHint = input<string>('');
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
