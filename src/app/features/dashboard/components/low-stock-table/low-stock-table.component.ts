import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { BadgeComponent } from '@shared/components/badge/badge.component';

import type { LowStockRow } from '../../models/dashboard-view.model';

/** Varianti sotto soglia (dumb puro): numero sempre leggibile, mai solo colore. */
@Component({
  selector: 'app-low-stock-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './low-stock-table.component.html',
  styleUrl: './low-stock-table.component.scss',
})
export class LowStockTableComponent {
  readonly rows = input.required<readonly LowStockRow[]>();
}
