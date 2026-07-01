import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { DocumentLine } from '@core/models/document.model';
import { formatMoney } from '@core/utils/money.util';

/** Tabella righe documento (dumb, sola lettura). Mobile come card impilate. */
@Component({
  selector: 'app-document-lines-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-lines-table.component.html',
  styleUrl: './document-lines-table.component.scss',
})
export class DocumentLinesTableComponent {
  readonly lines = input.required<readonly DocumentLine[]>();

  protected readonly formatMoney = formatMoney;

  protected vatLabel(line: DocumentLine): string {
    return line.vatRatePercent != null ? `${line.vatRatePercent}%` : '—';
  }

  protected discountLabel(line: DocumentLine): string {
    return line.discountPercent > 0 ? `${line.discountPercent}%` : '—';
  }
}
