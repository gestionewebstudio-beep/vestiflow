import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  customerDisplayName,
  customerSourceLabel,
  type Customer,
} from '@core/models/customer.model';
import { formatDate } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

/**
 * Tabella clienti (dumb puro). Row click verso il dettaglio; mobile come card
 * impilate via data-label.
 */
@Component({
  selector: 'app-customer-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
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

  protected displayName(customer: Customer): string {
    return customerDisplayName(customer);
  }

  protected cityOf(customer: Customer): string {
    return customer.address?.city ?? '—';
  }

  protected provinceOf(customer: Customer): string {
    return customer.address?.province ?? '—';
  }

  protected sourceLabel(customer: Customer): string {
    return customerSourceLabel(customer.source);
  }

  protected sourceTone(customer: Customer): 'info' | 'neutral' {
    return customer.source === 'shopify' ? 'info' : 'neutral';
  }

  protected alsoSupplierLabel(customer: Customer): string {
    return customer.linkedSupplierId ? 'Sì' : '—';
  }

  protected createdAtLabel(customer: Customer): string {
    return formatDate(customer.createdAt);
  }

  protected rowLabel(customer: Customer): string {
    return `Apri cliente ${this.displayName(customer)}`;
  }
}
