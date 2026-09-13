import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatDateTime } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';

import type { Money } from '@core/models/money.model';

/** Una rettifica del canale, alla sua data. */
export interface RettificaCanale {
  readonly id: string;
  /** `return_with_restock` · `refund_only` · `cancellation` (o altro, se il canale ne inventa). */
  readonly kind: string;
  readonly occurredAt: string;
  readonly total: Money;
  readonly note?: string | null;
}

/** Le tre quantità di una riga: ordinata, annullata dal canale, spedita. */
export interface QuantitaRiga {
  readonly id: string;
  readonly description: string;
  readonly ordered: number;
  readonly cancelled: number;
  readonly shipped: number;
}

const ETICHETTE_RETTIFICA: Readonly<Record<string, string>> = {
  return_with_restock: 'Reso',
  refund_only: 'Rimborso',
  cancellation: 'Annullamento',
};

/**
 * ⭐ Il raccordo economico di un ordine di canale, letto e mai riscritto: il VALORE
 *    ORIGINARIO, le RETTIFICHE (una per rimborso, ciascuna alla sua data) e il TOTALE
 *    AGGIORNATO; per ogni riga le quantità ORDINATE · ANNULLATE · SPEDITE. Deciso dal
 *    proprietario il 13/09/2026 sull'ordine #1014 del collaudo reale: 2.249,85 −
 *    749,95 = 1.499,90, con 3 ordinati · 1 annullato · 2 spediti.
 *
 * ⚠️ Le annullate sono un dato del canale (righe rimborsate `cancel`), non
 *    «ordinate − spedite»: durante un'evasione parziale il residuo è ancora da
 *    spedire. Lo usano l'Ordine di canale e la Vendita online: stessa forma.
 *
 * ⛔ Somma e totale aggiornato ARRIVANO (dalla testata: la somma scritta coi
 *    rimborsi, la differenza generata dal database): qui non si somma e non si
 *    sottrae, si mostra. Dumb: riceve dati, non conosce servizi.
 */
@Component({
  selector: 'app-channel-order-rettifiche',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './channel-order-rettifiche.component.html',
  styleUrl: './channel-order-rettifiche.component.scss',
})
export class ChannelOrderRettificheComponent {
  readonly originalTotal = input.required<Money>();
  readonly refundTotal = input.required<Money>();
  readonly updatedTotal = input.required<Money>();
  readonly refunds = input.required<readonly RettificaCanale[]>();
  readonly lines = input<readonly QuantitaRiga[]>([]);

  /** Le righe con almeno una quantità annullata o spedita: le altre non dicono niente. */
  protected readonly righeConMovimento = computed(() =>
    this.lines().filter((riga) => riga.cancelled > 0 || riga.shipped > 0),
  );

  protected readonly formatMoney = formatMoney;
  protected readonly formatDateTime = formatDateTime;

  protected etichetta(kind: string): string {
    return ETICHETTE_RETTIFICA[kind] ?? 'Rettifica';
  }
}
