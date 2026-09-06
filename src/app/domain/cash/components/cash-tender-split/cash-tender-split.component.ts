import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { EntityId } from '@core/models/common.model';
import type { PaymentOption } from '@core/models/payment-option.model';
import { formatMoney } from '@core/utils/money.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { MoneyInputComponent } from '@shared/components/money-input/money-input.component';

/**
 * La composizione dell'incasso: **una o più quote**, contanti ed elettronico.
 *
 * ⛔ **Resta specializzato per la Cassa**, e non si fonde col componente
 * finanziario dei documenti: là si programmano scadenze e allocazioni, qui si
 * incassa adesso. Sono due mestieri con lo stesso nome.
 *
 * ⭐ **Il resto è un'ANTEPRIMA**: `tendered − amount` sulle sole quote contanti.
 * Il valore che conta lo restituisce il server alla conferma, e la schermata
 * mostra quello.
 *
 * ⚠️ **Un Tipo non classificato non compare**: senza `tenderKind` la Cassa non
 * sa se quel denaro entra nel cassetto o sul terminale, e la quadratura si
 * fermerebbe alla chiusura. Si dice qui, non si scopre a fine giornata.
 */
@Component({
  selector: 'app-cash-tender-split',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, MoneyInputComponent],
  templateUrl: './cash-tender-split.component.html',
  styleUrl: './cash-tender-split.component.scss',
})
export class CashTenderSplitComponent {
  /** I Tipi pagamento utilizzabili: solo quelli CLASSIFICATI. */
  readonly options = input.required<readonly PaymentOption[]>();
  readonly totalMinor = input.required<number>();
  readonly quotas = input.required<readonly CashQuotaDraft[]>();
  readonly disabled = input(false);

  readonly quotasChange = output<readonly CashQuotaDraft[]>();

  protected readonly usabili = computed(() =>
    this.options().filter((o) => o.isActive && o.kind === 'method' && o.tenderKind !== null),
  );

  /** I Tipi che la Cassa non può usare: si dicono, non si nascondono. */
  protected readonly nonClassificati = computed(() =>
    this.options().filter((o) => o.isActive && o.kind === 'method' && o.tenderKind === null),
  );

  protected readonly assegnato = computed(() =>
    this.quotas().reduce((tot, q) => tot + (q.amountMinor ?? 0), 0),
  );

  /** ⭐ Quanto manca: positivo se resta da incassare, negativo se si eccede. */
  protected readonly residuo = computed(() => this.totalMinor() - this.assegnato());

  /** Anteprima del resto: solo sul contante, e mai negativo. */
  protected readonly resto = computed(() =>
    this.quotas().reduce((tot, q) => {
      const opzione = this.usabili().find((o) => o.id === q.paymentOptionId);
      if (opzione?.tenderKind !== 'cash') {
        return tot;
      }
      return tot + Math.max(0, (q.tenderedMinor ?? 0) - (q.amountMinor ?? 0));
    }, 0),
  );

  /** I nomi dei Tipi che la Cassa non può usare, per dirlo all'operatore. */
  protected readonly nomiNonClassificati = computed(() =>
    this.nonClassificati()
      .map((o) => o.name)
      .join(', '),
  );

  protected classeDi(quota: CashQuotaDraft): PaymentOption['tenderKind'] {
    return this.usabili().find((o) => o.id === quota.paymentOptionId)?.tenderKind ?? null;
  }

  /** La quota già composta per quel Tipo, se c'è. */
  protected findQuota(paymentOptionId: EntityId): CashQuotaDraft | undefined {
    return this.quotas().find((q) => q.paymentOptionId === paymentOptionId);
  }

  protected nomeDi(quota: CashQuotaDraft): string {
    return this.usabili().find((o) => o.id === quota.paymentOptionId)?.name ?? '—';
  }

  protected soldi(minor: number): string {
    return formatMoney({ amountMinor: minor, currencyCode: 'EUR' });
  }

  /** Aggiunge una quota col RESIDUO: è quasi sempre quello che si vuole. */
  protected aggiungi(paymentOptionId: EntityId): void {
    if (this.quotas().some((q) => q.paymentOptionId === paymentOptionId)) {
      return;
    }
    const residuo = Math.max(0, this.residuo());
    this.quotasChange.emit([
      ...this.quotas(),
      { paymentOptionId, amountMinor: residuo, tenderedMinor: null, confirmed: false },
    ]);
  }

  protected rimuovi(paymentOptionId: EntityId): void {
    this.quotasChange.emit(this.quotas().filter((q) => q.paymentOptionId !== paymentOptionId));
  }

  protected cambiaImporto(paymentOptionId: EntityId, valore: number | null): void {
    this.aggiorna(paymentOptionId, (q) => ({ ...q, amountMinor: valore ?? 0 }));
  }

  protected cambiaConsegnato(paymentOptionId: EntityId, valore: number | null): void {
    this.aggiorna(paymentOptionId, (q) => ({ ...q, tenderedMinor: valore }));
  }

  protected cambiaConferma(paymentOptionId: EntityId, confermato: boolean): void {
    this.aggiorna(paymentOptionId, (q) => ({ ...q, confirmed: confermato }));
  }

  private aggiorna(
    paymentOptionId: EntityId,
    trasforma: (q: CashQuotaDraft) => CashQuotaDraft,
  ): void {
    this.quotasChange.emit(
      this.quotas().map((q) => (q.paymentOptionId === paymentOptionId ? trasforma(q) : q)),
    );
  }
}

/** Una quota in composizione, prima della conferma. */
export interface CashQuotaDraft {
  readonly paymentOptionId: EntityId;
  readonly amountMinor: number;
  /** Solo contanti: il denaro consegnato dal cliente. */
  readonly tenderedMinor: number | null;
  /** Solo elettronico: l'operatore conferma l'esito letto sul terminale. */
  readonly confirmed: boolean;
}
