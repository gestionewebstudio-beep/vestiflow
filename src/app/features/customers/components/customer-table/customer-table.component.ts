import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { Customer } from '@core/models/customer.model';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

/**
 * Tabella clienti (dumb puro). Row click verso il dettaglio; mobile come card
 * impilate via data-label.
 */
@Component({
  selector: 'app-customer-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-table.component.html',
  styleUrl: './customer-table.component.scss',
})
export class CustomerTableComponent {
  readonly customers = input.required<readonly Customer[]>();
  readonly columns = input.required<readonly ResolvedTableColumn[]>();

  readonly rowClick = output<Customer>();

  protected readonly visibleIds = computed(() => new Set(this.columns().map((col) => col.id)));

  protected showColumn(id: string): boolean {
    return this.visibleIds().has(id);
  }

  protected columnLabel(id: string): string {
    return this.columns().find((col) => col.id === id)?.label ?? id;
  }

  protected fullName(customer: Customer): string {
    return `${customer.firstName} ${customer.lastName}`;
  }

  protected cityOf(customer: Customer): string {
    return customer.address?.city ?? '—';
  }

  protected rowLabel(customer: Customer): string {
    return `Apri cliente ${this.fullName(customer)}`;
  }
}
