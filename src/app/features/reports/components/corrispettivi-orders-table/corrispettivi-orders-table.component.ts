import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { BadgeTone } from '@shared/components/badge/badge.component';

import {
  FISCAL_STATUS_LABELS,
  FISCAL_STATUS_TONES,
  type CorrispettiviOrder,
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

@Component({
  selector: 'app-corrispettivi-orders-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './corrispettivi-orders-table.component.html',
  styleUrl: './corrispettivi-orders-table.component.scss',
})
export class CorrispettiviOrdersTableComponent {
  readonly orders = input.required<readonly CorrispettiviOrder[]>();

  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;
  protected readonly fiscalLabel = FISCAL_STATUS_LABELS;
  protected readonly fiscalTone = FISCAL_STATUS_TONES;

  protected sourceLabel(source: string): string {
    return SOURCE_LABELS[source] ?? source;
  }

  protected financialLabel(status: string): string {
    return FINANCIAL_LABELS[status] ?? status;
  }

  protected financialTone(status: string): BadgeTone {
    return FINANCIAL_TONES[status] ?? 'neutral';
  }
}
