import type { CurrencyCode, EntityId, IsoDateString, Money } from '@core/models/common.model';

/** Stato fiscale corrispettivi per il commercialista (§8). */

/**
 * Una riga del registro: o una vendita, o una rettifica.
 *
 * Le rettifiche portano importi **negativi**, così la colonna si somma a occhio
 * e il totale in fondo alla schermata si ricostruisce riga per riga. Non sono
 * documenti nuovi: derivano dalle vendite e dai rimborsi del canale.
 */
export type CorrispettiviRowKind = 'sale' | 'refund';

/** Che gesto è stata la rettifica (solo sulle righe `refund`). */
export type CorrispettiviRefundKind = 'return_with_restock' | 'refund_only' | 'cancellation';

export interface CorrispettiviRegisterRow {
  readonly rowId: string;
  readonly kind: CorrispettiviRowKind;
  /** Sempre presente: da qui si apre l'ordine, anche partendo da una rettifica. */
  readonly salesOrderId: EntityId;
  readonly orderNumber: string;
  readonly occurredAt: IsoDateString;
  readonly source: string;
  readonly customerName: string;
  readonly customerEmail?: string;
  readonly currency: CurrencyCode;
  readonly taxable: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly financialStatus?: string;
  readonly refundKind?: CorrispettiviRefundKind;
  readonly note?: string;
}

export interface CorrispettiviSummary {
  readonly orderCount: number;
  /** Ordini «evasi» ma senza data: non conteggiabili, e non nascosti. */
  readonly undatedFulfilmentCount: number;
  readonly refundsCount: number;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly shipping: Money;
  readonly discount: Money;
  readonly total: Money;
  readonly taxable: Money;
  /** Rettifiche del periodo, alla loro data. Gli annullamenti restano fuori. */
  readonly refundCount: number;
  readonly refundTotal: Money;
  readonly refundTax: Money;
  /** Annullamenti: si contano per trasparenza, non si sottraggono mai. */
  readonly cancellationCount: number;
  readonly cancellationTotal: Money;
  /** Il numero che conta: venduto meno reso. */
  readonly netTotal: Money;
  readonly netTax: Money;
  readonly netTaxable: Money;
}

export interface CorrispettiviListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly financialStatus?: string;
  readonly source?: string;
  readonly placedFrom?: string;
  readonly placedTo?: string;
  /** Ambito: online oppure no. Derivato dall’origine, mai persistito. */
  readonly ambito?: 'all' | 'online' | 'fisico_pos';
  /** Canale: chi ha raccolto la vendita. Dimensione distinta dall’ambito. */
  readonly canale?: 'all' | 'shopify' | 'vestiflow';
  /** `sales` · `returns` · `refunds` — filtra l'elenco, non il riepilogo. */
  readonly rowType?: string;
  readonly refundsOnly?: boolean;
}
