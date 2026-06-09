import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { BadgeComponent } from '@shared/components/badge/badge.component';

import { stockStatusLabel, stockStatusTone } from '../../models/inventory-labels.util';
import type { InventoryLevelRow } from '../../models/inventory-view.model';

/**
 * Tabella giacenze per variante × location. Dumb puro: riceve righe già
 * join-ate. Mobile: card impilate via data-label; numeri in tabular-nums.
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

  protected readonly statusLabel = stockStatusLabel;
  protected readonly statusTone = stockStatusTone;
}
