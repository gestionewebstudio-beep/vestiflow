import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowActionsDirective } from '@shared/components/data-table/data-table-row-actions.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type { DataTableSort } from '@shared/components/data-table/data-table.model';

import { SALES_ORDER_LIST_SORTABLE_COLUMNS } from '../../models/sales-order-list-columns.config';
import type { DataTableSection } from '@shared/components/data-table/data-table.model';
import { isAllSelected, isSomeSelected } from '@shared/utils/list-selection';
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
  financialStatusLabel,
  financialStatusTone,
  fulfillmentStatusLabel,
  fulfillmentStatusTone,
  salesOrderLinesSummary,
  sourceLabel,
} from '@domain/sales-orders/models/sales-order-labels.util';
import { sezioniDiElenco } from '@shared/models/list-grouping.util';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';

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
 * aggiunge DDT, ultimo aggiornamento e stato sync.
 */
@Component({
  selector: 'app-sales-order-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionMenuComponent,
    BadgeComponent,
    RouterLink,
    DataTableComponent,
    DataTableCellDirective,
    DataTableRowCardDirective,
    DataTableRowActionsDirective,
  ],
  templateUrl: './sales-order-table.component.html',
  styleUrl: './sales-order-table.component.scss',
})
export class SalesOrderTableComponent {
  readonly orders = input.required<readonly SalesOrder[]>();

  /**
   * ⭐ **Sotto `lg` il tocco SELEZIONA invece di aprire**, quando la modalità
   * «Seleziona» del telaio è accesa.
   *
   * ⚠️ Input di passaggio: la tabella non decide, inoltra al motore. La modalità
   * la possiede la pagina (`createSelectionMode`), che è anche l'unica a poter
   * azzerare la selezione quando si spegne.
   */
  readonly rowClickSelects = input(false);
  /** Colonne visibili, nell'ordine scelto dal selettore «Colonne». */
  readonly columns = input.required<readonly ResolvedTableColumn[]>();

  /**
   * ⭐ **Raggruppare per giornata**, deciso dalla pagina che possiede il controllo
   * «Raggruppa». Qui arriva già risolto: la tabella non conosce il menu, sa solo
   * se piegare l'elenco per giorno.
   */
  readonly groupByDay = input(false);

  /** Chiavi di ordinamento correnti: lo stato sta nella pagina (`14` §H4). */
  readonly sort = input<readonly DataTableSort[]>([]);
  readonly profile = input<SalesOrderTableProfile>('customer-orders');
  /** Selezione multipla per operazioni massive (come Arrivi merce). */
  readonly selectable = input<boolean>(false);
  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());
  /** Azioni di gestione (Elimina) mostrate solo con permesso documenti. */
  readonly canManage = input<boolean>(false);

  readonly rowClick = output<SalesOrder>();

  /** Il motore propone il prossimo ordine; ad applicarlo è la pagina. */
  readonly sortChange = output<readonly DataTableSort[]>();
  readonly action = output<SalesOrderTableActionEvent>();
  readonly selectionChange = output<SalesOrderTableSelectionEvent>();
  readonly selectAllChange = output<boolean>();

  // Le due regole della checkbox di testata vivono nella primitiva comune:
  // erano identiche qui e in `sales-order-table`, e `supplier-order-table`
  // stava per essere la terza copia (`14` §4).
  private readonly visibleIds = computed(() => this.orders().map((order) => order.id));
  protected readonly allSelected = computed(() =>
    isAllSelected(this.visibleIds(), this.selectedIds()),
  );
  protected readonly someSelected = computed(() =>
    isSomeSelected(this.visibleIds(), this.selectedIds()),
  );

  protected readonly financialLabel = financialStatusLabel;
  protected readonly financialTone = financialStatusTone;
  protected readonly fulfillmentLabel = fulfillmentStatusLabel;
  protected readonly fulfillmentTone = fulfillmentStatusTone;
  protected readonly sourceLabel = sourceLabel;
  protected readonly formatDate = formatDate;
  protected readonly formatMoney = formatMoney;

  /** Data compatta gg/mm/aa (mockup restyling): scansione veloce in colonna. */
  protected compactDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  }

  /**
   * Classe del pallino origine: grigio Manuale (default), verde Shopify
   * (Online/POS). TikTok non esiste come canale nel modello dati: se un giorno
   * arriverà basterà aggiungere il caso qui.
   */
  protected originDotClass(source: SalesOrderSource): string {
    return source === SalesOrderSource.Manual ? '' : 'sales-table__origin-dot--shopify';
  }

  /**
   * Riga secondaria del cliente: il **codice anagrafica**, e nient'altro.
   *
   * ⛔ **Mai l'email** — decisione del proprietario, 29/08/2026. Qui c'era un
   * ripiego `customerCode || customerEmail`: sugli ordini del canale online il
   * codice anagrafica non c'è quasi mai, quindi il ripiego non era un caso
   * limite — era il comportamento normale, e l'indirizzo di ogni cliente
   * finiva stampato sotto il suo nome in un elenco che si consulta tutto il
   * giorno, anche a schermo condiviso.
   *
   * ⚠️ Un dato personale non entra in un riepilogo per ripiego. Se un giorno
   * dovesse servire, è una **colonna** che l'operatore accende — non una riga
   * che compare da sé.
   *
   * Il modello ordine non porta P.IVA né storico ordini, quindi qui non
   * compaiono (a differenza del mockup, popolato con dati d'esempio).
   */
  protected customerSecondary(order: SalesOrder): string {
    return order.customerCode?.trim() ?? '';
  }

  protected orderStateLabel(order: SalesOrder): string {
    // Ordine manuale: stati del documento (§STATI Ordine cliente + prompt DDT).
    if (order.source === SalesOrderSource.Manual) {
      switch (manualOrderState(order)) {
        case 'cancelled':
          return 'Annullato';
        case 'concluded':
          return 'Concluso';
        case 'to_confirm':
          return 'Da confermare';
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
        case 'to_confirm':
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

  /**
   * «Non su Shopify» viene prima di tutto il resto: è il fatto più importante
   * sullo stato di sincronizzazione di quell'ordine, e dire «Sincronizzato» di
   * un ordine che sul canale non esiste più sarebbe falso.
   */
  protected syncStateLabel(order: SalesOrder): string {
    if (order.channelMissingSince) {
      return 'Non su Shopify';
    }
    if (order.requiresReview) {
      return 'Da verificare';
    }
    return order.shopify ? 'Sincronizzato' : '—';
  }

  protected syncStateTone(order: SalesOrder): BadgeTone {
    // `error` e non `warning`: «da verificare» è un dubbio, «non c'è più sul
    // canale» è un fatto, e le due righe devono distinguersi a colpo d'occhio.
    if (order.channelMissingSince) {
      return 'error';
    }
    if (order.requiresReview) {
      return 'warning';
    }
    return order.shopify ? 'success' : 'neutral';
  }

  /**
   * Il testo al passaggio del mouse. Sulla riga «non su Shopify» va letto
   * insieme alla colonna Stato: annullato e poi sparito è la sequenza normale,
   * confermato e sparito è quella da guardare — lì c'era merce impegnata.
   */
  protected syncStateHint(order: SalesOrder): string | null {
    if (order.channelMissingSince) {
      return `Non risulta più su Shopify dal ${formatDate(order.channelMissingSince)}. Gli impegni di magazzino sono stati liberati; la rimozione resta una tua scelta.`;
    }
    return order.reviewReason ?? null;
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
    // Gli ordini di canale non si eliminano — appartengono a Shopify, e il
    // prossimo scarico li riporterebbe. Tranne quelli che su Shopify non
    // risultano più: lì non c'è più niente da cui tornare, ed è l'unica azione
    // prevista dopo la segnalazione.
    if (this.canManage() && (isManual || order.channelMissingSince)) {
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

  // ── Il motore comune (`14` parte H) ───────────────────────────────────────

  /** Lista piatta: una sezione senza intestazione né piede. */
  /**
   * Le colonne per il motore, con l'ordinabilità già dichiarata: specchio della
   * whitelist del server (`14` §H15).
   */
  protected readonly engineColumns = computed<readonly ResolvedTableColumn[]>(() =>
    this.columns().map((column) => ({
      ...column,
      sortable: SALES_ORDER_LIST_SORTABLE_COLUMNS.has(column.id),
    })),
  );

  /**
   * ⚠️ **Il subtotale somma le righe caricate**, ed è corretto: l'elenco non
   * impagina, quindi ciò che ha in mano **è** il risultato del filtro. Stessa
   * aritmetica della riga totali, un livello più in basso.
   */
  protected readonly sections = computed<readonly DataTableSection<SalesOrder>[]>(() => {
    const valuta = this.orders()[0]?.total.currencyCode ?? DEFAULT_CURRENCY;
    const soldi = (n: number): string => formatMoney({ amountMinor: n, currencyCode: valuta });
    return sezioniDiElenco(this.orders(), this.groupByDay(), {
      idPiatto: 'ordini',
      giornoDi: (order) => order.placedAt,
      columns: this.columns(),
      emphasis: 'total',
      campi: {
        total: { valore: (o) => o.total.amountMinor, formato: soldi },
        netTotal: { valore: (o) => o.subtotal.amountMinor, formato: soldi },
      },
    });
  });

  /*
    ⛔ **La riga totali del motore è SPENTA su questo elenco.** Dal 31/08/2026 i
    riepiloghi dei documenti — acquisti, ordini, vendite — usano la **fascia**
    nella forma del Registro Corrispettivi (`app-list-summary`), e le due insieme
    direbbero gli stessi numeri due volte nella stessa schermata.

    ⭐ **Il calcolo non è sparito: si è spostato** nella PAGINA, che è dove vive lo
    slot `[summary]` del telaio.
  */
  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  protected visibile(columnId: string): boolean {
    return this.columns().some((column) => column.id === columnId);
  }

  protected readonly rowId = (order: SalesOrder): string => order.id;

  protected readonly rowLabelFor = (order: SalesOrder): string => this.rowLabel(order);

  protected readonly selectionLabel = (order: SalesOrder): string =>
    `Seleziona ordine ${order.orderNumber}`;

  /** Il testo delle celle che sono testo. */
  protected readonly cellText = (order: SalesOrder, columnId: string): string => {
    switch (columnId) {
      case 'orderNumber':
        return order.orderNumber;
      case 'placedAt':
        return this.compactDate(order.placedAt);
      case 'customerCode':
        return order.customerCode || '—';
      case 'customerName':
        return order.customerName;
      case 'total':
        return formatMoney(order.total);
      case 'netTotal':
        // ⚠️ La colonna «Tot. netto» mostra il SUBTOTALE: era così anche prima.
        return formatMoney(order.subtotal);
      case 'location':
        return order.locationName ?? '—';
      case 'notes':
        return order.notes || '—';
      case 'updatedAt':
        return formatDate(order.updatedAt);
      default:
        return '';
    }
  };
}
