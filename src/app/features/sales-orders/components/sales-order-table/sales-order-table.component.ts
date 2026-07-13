import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { SalesOrder } from '@core/models/sales-order.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { BadgeTone } from '@shared/components/badge/badge.component';

import {
  corrispettivoStatusTone,
  financialStatusLabel,
  financialStatusTone,
  fulfillmentStatusLabel,
  fulfillmentStatusTone,
  salesOrderLinesSummary,
  sourceLabel,
} from '../../models/sales-order-labels.util';

/** Vista lista ordini: registro generale o canale Shopify (fase 3 §2-§3). */
export type SalesOrderTableProfile = 'customer-orders' | 'shopify-orders';

/**
 * Tabella ordini cliente (dumb puro). Row click verso il dettaglio; importi a
 * destra in tabular-nums; mobile come card impilate. Il profilo «shopify-orders»
 * aggiunge Corrispettivo, DDT, ultimo aggiornamento e stato sync.
 */
@Component({
  selector: 'app-sales-order-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, RouterLink],
  templateUrl: './sales-order-table.component.html',
  styleUrl: './sales-order-table.component.scss',
})
export class SalesOrderTableComponent {
  readonly orders = input.required<readonly SalesOrder[]>();
  readonly profile = input<SalesOrderTableProfile>('customer-orders');

  readonly rowClick = output<SalesOrder>();

  protected readonly isShopifyProfile = computed(() => this.profile() === 'shopify-orders');

  protected readonly financialLabel = financialStatusLabel;
  protected readonly financialTone = financialStatusTone;
  protected readonly fulfillmentLabel = fulfillmentStatusLabel;
  protected readonly fulfillmentTone = fulfillmentStatusTone;
  protected readonly sourceLabel = sourceLabel;
  protected readonly corrispettivoTone = corrispettivoStatusTone;
  protected readonly formatDate = formatDate;
  protected readonly formatMoney = formatMoney;

  protected orderStateLabel(order: SalesOrder): string {
    if (order.cancelledAt) {
      return 'Annullato';
    }
    if (order.fulfillmentStatus === 'fulfilled') {
      return 'Evaso';
    }
    return 'Aperto';
  }

  protected orderStateTone(order: SalesOrder): BadgeTone {
    if (order.cancelledAt) {
      return 'error';
    }
    if (order.fulfillmentStatus === 'fulfilled') {
      return 'success';
    }
    return 'info';
  }

  protected syncStateLabel(order: SalesOrder): string {
    if (order.requiresReview) {
      return 'Da verificare';
    }
    return order.shopify ? 'Sincronizzato' : '—';
  }

  protected syncStateTone(order: SalesOrder): BadgeTone {
    if (order.requiresReview) {
      return 'warning';
    }
    return order.shopify ? 'success' : 'neutral';
  }

  protected rowLabel(order: SalesOrder): string {
    const items = salesOrderLinesSummary(order.lines);
    return `Apri ordine ${order.orderNumber} di ${order.customerName}, articoli: ${items}`;
  }
}
