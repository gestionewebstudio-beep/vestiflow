import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { InventoryCountSession } from '@core/models/inventory-count.model';
import { formatDateTime } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';

import {
  inventoryCountStatusLabel,
  inventoryCountStatusTone,
} from '../../models/inventory-count-labels.util';

/** Tabella sessioni inventario fisico (dumb). */
@Component({
  selector: 'app-inventory-count-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './inventory-count-table.component.html',
  styleUrl: './inventory-count-table.component.scss',
})
export class InventoryCountTableComponent {
  readonly sessions = input.required<readonly InventoryCountSession[]>();

  readonly rowClick = output<InventoryCountSession>();

  protected readonly formatDate = formatDateTime;
  protected readonly statusLabel = inventoryCountStatusLabel;
  protected readonly statusTone = inventoryCountStatusTone;

  protected progress(session: InventoryCountSession): string {
    if (session.lineCount === 0) {
      return '0 / 0';
    }
    return `${session.linesCounted} / ${session.lineCount}`;
  }
}
