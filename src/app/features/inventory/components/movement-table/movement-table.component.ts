import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { BadgeComponent } from '@shared/components/badge/badge.component';

import { movementTypeLabel, movementTypeTone } from '../../models/inventory-labels.util';
import type { StockMovementRow } from '../../models/inventory-view.model';

/**
 * Tabella storico movimenti. Dumb puro: righe già formattate (segno quantità,
 * date, label location). Audit visibile: chi, quando, cosa, quanto.
 */
@Component({
  selector: 'app-movement-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './movement-table.component.html',
  styleUrl: './movement-table.component.scss',
})
export class MovementTableComponent {
  readonly rows = input.required<readonly StockMovementRow[]>();

  protected readonly typeLabel = movementTypeLabel;
  protected readonly typeTone = movementTypeTone;
}
