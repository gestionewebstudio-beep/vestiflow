import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { Money } from '@core/models/money.model';
import { formatMoney, moneyToDecimalString, parseMoneyInput } from '@core/utils/money.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { TenderRow } from '@domain/store-sales/models/store-sale-tender.util';
import type { StoreSalePaymentMethod } from '@domain/store-sales/models/store-sale.model';

/**
 * Pagamento multi-tender della cassa (dumb): righe per metodo, quadratura e
 * resto. Lo STATO delle righe vive nel register (smart); qui si mostra, si
 * parsa l'input in unità minori e si emettono valori già puliti.
 */
@Component({
  selector: 'app-pos-payment-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, SelectMenuComponent],
  templateUrl: './pos-payment-panel.component.html',
  styleUrl: './pos-payment-panel.component.scss',
})
export class PosPaymentPanelComponent {
  readonly rows = input.required<readonly TenderRow[]>();
  /** Quanto manca alla quadratura (negativo = quote oltre il totale). */
  readonly remainingMinor = input.required<number>();
  /** Resto da rendere sui contanti. */
  readonly changeMinor = input(0);
  /** Contanti digitati sotto la quota da incassare. */
  readonly hasShortfall = input(false);
  readonly methodOptions = input.required<readonly SelectMenuOption[]>();

  readonly methodChange = output<{ index: number; method: StoreSalePaymentMethod }>();
  readonly amountChange = output<{ index: number; amountMinor: number }>();
  readonly noteChange = output<{ index: number; note: string }>();
  readonly tenderedChange = output<{ index: number; tenderedMinor: number | null }>();
  readonly addRow = output<void>();
  readonly removeRow = output<number>();

  protected onMethodChange(index: number, value: string | null): void {
    if (value === 'cash' || value === 'card' || value === 'other') {
      this.methodChange.emit({ index, method: value });
    }
  }

  protected onAmountInput(index: number, event: Event): void {
    const parsed = parseMoneyInput((event.target as HTMLInputElement).value);
    if (parsed && parsed.amountMinor >= 0) {
      this.amountChange.emit({ index, amountMinor: parsed.amountMinor });
    }
  }

  protected onNoteInput(index: number, event: Event): void {
    this.noteChange.emit({ index, note: (event.target as HTMLInputElement).value });
  }

  /** «Ricevuti»: vuoto = non digitato (nessun resto da mostrare). */
  protected onTenderedInput(index: number, event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    if (raw === '') {
      this.tenderedChange.emit({ index, tenderedMinor: null });
      return;
    }
    const parsed = parseMoneyInput(raw);
    if (parsed && parsed.amountMinor >= 0) {
      this.tenderedChange.emit({ index, tenderedMinor: parsed.amountMinor });
    }
  }

  /** La quota si vede e si digita in euro, come ogni importo di cassa. */
  protected amountValue(row: TenderRow): string {
    return moneyToDecimalString({ amountMinor: row.amountMinor, currencyCode: 'EUR' }).replace(
      '.',
      ',',
    );
  }

  protected tenderedValue(row: TenderRow): string {
    return row.tenderedMinor == null
      ? ''
      : moneyToDecimalString({ amountMinor: row.tenderedMinor, currencyCode: 'EUR' }).replace(
          '.',
          ',',
        );
  }

  protected money(amountMinor: number): string {
    const money: Money = { amountMinor, currencyCode: 'EUR' };
    return formatMoney(money);
  }
}
