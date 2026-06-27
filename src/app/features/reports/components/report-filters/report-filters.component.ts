import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { SalesOrderFinancialStatus, SalesOrderSource } from '@core/models/sales-order.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/** Filtri di raffinamento per il riepilogo vendite (dumb). */
@Component({
  selector: 'app-report-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, SelectMenuComponent],
  templateUrl: './report-filters.component.html',
  styleUrl: './report-filters.component.scss',
})
export class ReportFiltersComponent {
  readonly source = input<string>('');
  readonly financialStatus = input<string>('');
  readonly hasActiveFilters = input<boolean>(false);

  readonly sourceChange = output<string>();
  readonly financialStatusChange = output<string>();
  readonly resetFilters = output<void>();

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

  protected onSourceChange(value: string | null): void {
    this.sourceChange.emit(value ?? '');
  }

  protected onFinancialStatusChange(value: string | null): void {
    this.financialStatusChange.emit(value ?? '');
  }
}
