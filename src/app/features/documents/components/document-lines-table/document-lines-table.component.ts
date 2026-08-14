import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { DocumentLine } from '@core/models/document.model';
import { formatDiscountPercent } from '@core/utils/discount-percent.util';
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

  /**
   * Colonne di valore (Prezzo, Sconto, IVA, Totale). Si spengono sui documenti
   * di solo magazzino — trasferimento, rettifica, inventario — dove il prezzo
   * di riga è zero scritto fisso lato API: mostrarle stamperebbe una colonna
   * di zeri. Default acceso: i chiamanti che portano valori non cambiano.
   */
  readonly showPrices = input(true);

  protected readonly formatMoney = formatMoney;

  protected vatLabel(line: DocumentLine): string {
    const rate = line.vatSnapshot?.ratePercent;
    return rate != null ? `${rate}%` : '—';
  }

  protected discountLabel(line: DocumentLine): string {
    return Number(line.discountPercent) > 0
      ? formatDiscountPercent(Number(line.discountPercent))
      : '—';
  }
}
