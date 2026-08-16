import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { BadgeTone } from '@shared/components/badge/badge.component';

import {
  type CorrispettiviRefundKind,
  type CorrispettiviRegisterRow,
} from '../../models/corrispettivi.model';

const FINANCIAL_LABELS: Record<string, string> = {
  pending: 'In attesa',
  authorized: 'In attesa',
  paid: 'Pagato',
  partially_refunded: 'Rimborso parziale',
  refunded: 'Rimborsato',
  voided: 'Annullato',
};

const FINANCIAL_TONES: Record<string, BadgeTone> = {
  pending: 'warning',
  authorized: 'warning',
  paid: 'success',
  partially_refunded: 'warning',
  refunded: 'neutral',
  voided: 'error',
};

const SOURCE_LABELS: Record<string, string> = {
  shopify_online: 'Online',
  shopify_pos: 'Negozio',
  manual: 'Manuale',
};

/**
 * Cosa è stata la rettifica, detto con le parole dell'operatore.
 *
 * «Reso» e «Rimborso» sono cose diverse e vanno chiamate diversamente: nel
 * primo caso la merce è tornata, nel secondo sono tornati solo i soldi. Chi
 * legge il registro deve poterlo distinguere senza aprire l'ordine.
 */
const REFUND_KIND_LABELS: Record<CorrispettiviRefundKind, string> = {
  return_with_restock: 'Reso',
  refund_only: 'Rimborso',
  cancellation: 'Annullamento',
};

@Component({
  selector: 'app-corrispettivi-orders-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './corrispettivi-orders-table.component.html',
  styleUrl: './corrispettivi-orders-table.component.scss',
})
export class CorrispettiviOrdersTableComponent {
  readonly rows = input.required<readonly CorrispettiviRegisterRow[]>();

  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;

  protected sourceLabel(source: string): string {
    return SOURCE_LABELS[source] ?? source;
  }

  protected financialLabel(status: string): string {
    return FINANCIAL_LABELS[status] ?? status;
  }

  protected financialTone(status: string): BadgeTone {
    return FINANCIAL_TONES[status] ?? 'neutral';
  }

  protected refundLabel(kind: CorrispettiviRefundKind | undefined): string {
    return kind ? REFUND_KIND_LABELS[kind] : 'Rettifica';
  }
}
