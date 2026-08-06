import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { Supplier } from '@core/models/supplier.model';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

@Component({
  selector: 'app-supplier-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './supplier-table.component.html',
  styleUrl: './supplier-table.component.scss',
})
export class SupplierTableComponent {
  readonly suppliers = input.required<readonly Supplier[]>();
  readonly columns = input.required<readonly ResolvedTableColumn[]>();

  readonly rowClick = output<Supplier>();

  protected displayCode(supplier: Supplier): string {
    return supplier.code?.trim() || '—';
  }

  protected displayVat(supplier: Supplier): string {
    return supplier.vatNumber?.trim() || '—';
  }

  protected displayCity(supplier: Supplier): string {
    return supplier.city?.trim() || '—';
  }

  protected rowLabel(supplier: Supplier): string {
    return `Apri fornitore ${supplier.name}`;
  }
}
