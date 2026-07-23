import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  manualOrderState,
  SalesOrderSource,
  type SalesOrder,
} from '@core/models/sales-order.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { ActionMenuComponent } from '@shared/components/action-menu/action-menu.component';
import type { ActionMenuItem } from '@shared/components/action-menu/action-menu.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { BadgeTone } from '@shared/components/badge/badge.component';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

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

/** Azioni dal menu «···» di riga (senza Etichette per i documenti di vendita). */
export type SalesOrderTableActionId = 'open' | 'duplicate' | 'print' | 'delete';

export interface SalesOrderTableActionEvent {
  readonly action: SalesOrderTableActionId;
  readonly order: SalesOrder;
}

export interface SalesOrderTableSelectionEvent {
  readonly order: SalesOrder;
  readonly selected: boolean;
}

/**
 * Tabella ordini cliente (dumb puro). Row click verso il dettaglio; importi a
 * destra in tabular-nums; mobile come card impilate. Il profilo «shopify-orders»
 * aggiunge Corrispettivo, DDT, ultimo aggiornamento e stato sync.
 */
@Component({
  selector: 'app-sales-order-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionMenuComponent, BadgeComponent, RouterLink],
  templateUrl: './sales-order-table.component.html',
  styleUrl: './sales-order-table.component.scss',
})
export class SalesOrderTableComponent {
  readonly orders = input.required<readonly SalesOrder[]>();
  /** Colonne visibili, nell'ordine scelto dal selettore «Colonne». */
  readonly columns = input.required<readonly ResolvedTableColumn[]>();
  readonly profile = input<SalesOrderTableProfile>('customer-orders');
  /** Selezione multipla per operazioni massive (come Arrivi merce). */
  readonly selectable = input<boolean>(false);
  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());
  /** Azioni di gestione (Elimina) mostrate solo con permesso documenti. */
  readonly canManage = input<boolean>(false);

  readonly rowClick = output<SalesOrder>();
  readonly action = output<SalesOrderTableActionEvent>();
  readonly selectionChange = output<SalesOrderTableSelectionEvent>();
  readonly selectAllChange = output<boolean>();

  protected readonly allSelected = computed(() => {
    const orders = this.orders();
    const selected = this.selectedIds();
    return orders.length > 0 && orders.every((order) => selected.has(order.id));
  });

  protected readonly someSelected = computed(() => {
    const orders = this.orders();
    const selected = this.selectedIds();
    const count = orders.filter((order) => selected.has(order.id)).length;
    return count > 0 && count < orders.length;
  });

  protected readonly financialLabel = financialStatusLabel;
  protected readonly financialTone = financialStatusTone;
  protected readonly fulfillmentLabel = fulfillmentStatusLabel;
  protected readonly fulfillmentTone = fulfillmentStatusTone;
  protected readonly sourceLabel = sourceLabel;
  protected readonly corrispettivoTone = corrispettivoStatusTone;
  protected readonly formatDate = formatDate;
  protected readonly formatMoney = formatMoney;

  protected orderStateLabel(order: SalesOrder): string {
    // Ordine manuale: stati del documento (§STATI Ordine cliente + prompt DDT).
    if (order.source === SalesOrderSource.Manual) {
      switch (manualOrderState(order)) {
        case 'cancelled':
          return 'Annullato';
        case 'concluded':
          return 'Concluso';
        case 'partially_concluded':
          return 'Parzialmente concluso';
        default:
          return 'Confermato';
      }
    }
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
    if (order.source === SalesOrderSource.Manual) {
      switch (manualOrderState(order)) {
        case 'concluded':
          return 'info';
        case 'partially_concluded':
          return 'warning';
        default:
          return 'success';
      }
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

  /**
   * Voci del menu Azioni di riga: solo quelle disponibili (mai voci
   * disabilitate). Duplica / Stampa PDF / Allegati arrivano nelle fasi
   * successive; Etichette non serve per i documenti di vendita.
   */
  protected rowActions(order: SalesOrder): readonly ActionMenuItem[] {
    const isManual = order.source === SalesOrderSource.Manual;
    const items: ActionMenuItem[] = [
      { id: 'open', label: isManual ? 'Apri / Modifica' : 'Apri', icon: 'pi-pencil' },
    ];
    if (this.canManage()) {
      // Duplica: crea un NUOVO ordine manuale, quindi vale anche per i non
      // manuali (l'originale non si tocca).
      items.push({ id: 'duplicate', label: 'Duplica', icon: 'pi-copy' });
    }
    // Stampa PDF: azione di sola lettura, disponibile per qualunque ordine.
    items.push({ id: 'print', label: 'Stampa PDF', icon: 'pi-print' });
    if (this.canManage() && isManual) {
      items.push({ id: 'delete', label: 'Elimina', icon: 'pi-trash', danger: true });
    }
    return items;
  }

  protected onAction(actionId: string, order: SalesOrder): void {
    this.action.emit({ action: actionId as SalesOrderTableActionId, order });
  }

  protected onToggleSelect(order: SalesOrder, selected: boolean): void {
    this.selectionChange.emit({ order, selected });
  }
}
