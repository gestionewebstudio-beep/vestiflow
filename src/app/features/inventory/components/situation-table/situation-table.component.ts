import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { stockStatusLabel, stockStatusTone } from '../../models/inventory-labels.util';
import type { InventorySituationRow } from '../../models/inventory-situation.model';

/**
 * Tabella Situazione magazzino. Dumb puro: righe aggregate per variante con
 * selezione checkbox per il riordino (Nuovo ordine fornitore). Mobile: card
 * impilate via data-label; numeri in tabular-nums.
 */
@Component({
  selector: 'app-situation-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './situation-table.component.html',
  styleUrl: './situation-table.component.scss',
})
export class SituationTableComponent {
  readonly rows = input.required<readonly InventorySituationRow[]>();
  readonly columns = input.required<readonly ResolvedTableColumn[]>();
  readonly selectedIds = input.required<ReadonlySet<string>>();

  readonly rowToggle = output<InventorySituationRow>();
  readonly pageToggle = output<boolean>();

  protected readonly statusLabel = stockStatusLabel;
  protected readonly statusTone = stockStatusTone;

  protected readonly allOnPageSelected = computed(() => {
    const rows = this.rows();
    const selected = this.selectedIds();
    return rows.length > 0 && rows.every((row) => selected.has(row.variantId));
  });

  protected isSelected(row: InventorySituationRow): boolean {
    return this.selectedIds().has(row.variantId);
  }

  protected money(amountMinor: number | null, currency: string): string {
    if (amountMinor === null) {
      return '—';
    }
    return formatMoney({ amountMinor, currencyCode: currency });
  }

  protected onSelectAllClick(event: Event): void {
    this.pageToggle.emit((event.target as HTMLInputElement).checked);
  }
}
