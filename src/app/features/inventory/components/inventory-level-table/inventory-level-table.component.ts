import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { stockStatusLabel, stockStatusTone } from '../../models/inventory-labels.util';
import type { InventoryLevelRow } from '../../models/inventory-view.model';

/**
 * Tabella giacenze per variante × location. Dumb puro: riceve righe già
 * join-ate. Mobile: card impilate via data-label; numeri in tabular-nums.
 * La quantità Impegnata (> 0) è cliccabile: emette la riga per il drill-down
 * degli ordini che la compongono (§10 fase 1).
 */
@Component({
  selector: 'app-inventory-level-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './inventory-level-table.component.html',
  styleUrl: './inventory-level-table.component.scss',
})
export class InventoryLevelTableComponent {
  readonly rows = input.required<readonly InventoryLevelRow[]>();
  readonly columns = input.required<readonly ResolvedTableColumn[]>();

  readonly committedClick = output<InventoryLevelRow>();

  protected readonly statusLabel = stockStatusLabel;
  protected readonly statusTone = stockStatusTone;

  protected onCommittedClick(row: InventoryLevelRow): void {
    this.committedClick.emit(row);
  }
}
