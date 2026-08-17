import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
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

/**
 * Come si chiama l'origine di una riga del registro.
 *
 * ⚠️ `shopify_pos` diceva «Negozio», che è il negozio di **Shopify**, non
 * quello di VestiFlow — e `store`, che è davvero la cassa di VestiFlow,
 * mancava del tutto perché la Vendita al banco nel registro non ci entrava.
 */
const SOURCE_LABELS: Record<string, string> = {
  shopify_online: 'Shopify online',
  shopify_pos: 'Shopify POS',
  store: 'Vendita al banco',
  manual: 'Manuale',
  // La quarta sorgente (`docs/10` §12). Condivide con la Vendita al banco la
  // coppia Fisico/POS · VestiFlow, ma non l'origine: una registrazione digitata
  // e una vendita battuta al banco non devono confondersi in colonna.
  manual_receipt: 'Corrispettivo manuale',
};

/** La sede che manca non è una sede: si dice, non si lascia in bianco. */
const LOCATION_UNDETERMINED_LABEL = 'Non determinata';

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
  // Nessuna pill: tipo e pagamento si leggono dal colore del testo. Il tono
  // resta il vocabolario condiviso (`BadgeTone`), è il riquadro che se ne va.
  imports: [],
  templateUrl: './corrispettivi-orders-table.component.html',
  styleUrl: './corrispettivi-orders-table.component.scss',
})
export class CorrispettiviOrdersTableComponent {
  readonly rows = input.required<readonly CorrispettiviRegisterRow[]>();
  /**
   * L'operatore può correggere una registrazione manuale? Governa il solo
   * pulsante: il permesso vero sta sull'API, e nasconderlo qui è ergonomia.
   */
  readonly canEditManual = input(false);

  /**
   * Le colonne accese, dal selettore Colonne della pagina.
   *
   * Il componente resta **dumb**: non conosce le preferenze né il servizio che
   * le tiene — riceve un elenco e lo rispetta. Vuoto significa «tutte», così la
   * stampa, che un selettore non ce l'ha, non deve saperne niente.
   */
  readonly visibleColumns = input<readonly string[]>([]);

  /** Apertura di una registrazione manuale in modifica. */
  readonly manualReceiptOpened = output<string>();

  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;
  protected readonly locationUndeterminedLabel = LOCATION_UNDETERMINED_LABEL;

  /** Elenco vuoto = nessuna preferenza: si mostrano tutte. */
  protected isVisible(columnId: string): boolean {
    const visible = this.visibleColumns();
    return visible.length === 0 || visible.includes(columnId);
  }

  /**
   * Questa riga si apre? Solo le registrazioni manuali hanno una maschera dove
   * andare, e solo a chi può correggerle. Governa insieme mano, `tabindex` ed
   * etichetta: un solo predicato, così non può esistere una riga che si apre
   * col mouse ma non da tastiera.
   */
  protected isOpenable(row: CorrispettiviRegisterRow): boolean {
    return Boolean(row.manualReceiptId) && this.canEditManual();
  }

  protected openRow(row: CorrispettiviRegisterRow): void {
    if (row.manualReceiptId && this.canEditManual()) {
      this.manualReceiptOpened.emit(row.manualReceiptId);
    }
  }

  /** Spazio apre come Invio, ma prima trattiene lo scorrimento della pagina. */
  protected onRowSpace(row: CorrispettiviRegisterRow, event: Event): void {
    if (!this.isOpenable(row)) return;
    event.preventDefault();
    this.openRow(row);
  }

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
