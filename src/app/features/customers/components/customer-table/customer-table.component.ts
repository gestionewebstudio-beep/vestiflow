import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { Customer } from '@core/models/customer.model';

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

  readonly rowClick = output<Customer>();

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
