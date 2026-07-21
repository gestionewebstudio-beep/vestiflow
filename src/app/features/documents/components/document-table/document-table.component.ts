import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DocumentStatus } from '@core/models/document.model';
import type { DocumentRecord, LinkedPurchaseInvoiceInfo } from '@core/models/document.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { ActionMenuComponent } from '@shared/components/action-menu/action-menu.component';
import type { ActionMenuItem } from '@shared/components/action-menu/action-menu.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';
import { storeSalePaymentMethodLabelWithNote } from '@features/store-sales/models/store-sale-payment.util';

import { isGoodsReceiptDocumentType } from '../../models/document-goods-receipt.util';
import {
  documentReferenceLabel,
  documentStatusDisplayLabel,
  documentStatusDisplayTone,
  documentTypeLabel,
  goodsReceiptLinkStatusLabel,
  goodsReceiptLinkStatusTone,
} from '../../models/document-labels.util';
import { isStoreFlowDocumentType } from '../../models/document-operational.util';
import { isPrintableDocumentType } from '../../models/document-print.util';
import { isManualUnloadDocumentType } from '../../models/document-stock-operation.util';
import { goodsReceiptExternalDocLabel } from '../../utils/goods-receipt-list-export.util';

/** Azioni disponibili dal menu "···" della riga (audit cliente §1: azioni dalla lista). */
export type DocumentTableActionId =
  | 'open'
  | 'duplicate'
  | 'delete'
  | 'print'
  | 'labels'
  | 'attachments';

export interface DocumentTableActionEvent {
  readonly action: DocumentTableActionId;
  readonly doc: DocumentRecord;
}

/** Cambio selezione di una riga (checkbox operazioni massive). */
export interface DocumentTableSelectionEvent {
  readonly doc: DocumentRecord;
  readonly selected: boolean;
}

/**
 * Tabella registro documenti (dumb puro). Row click verso il dettaglio; importi
 * a destra in tabular-nums; mobile come card impilate. Colonna Azioni sempre
 * presente (non fa parte delle colonne configurabili): mostra solo le voci
 * realmente disponibili per tipo/stato della riga, mai voci disabilitate.
 */
@Component({
  selector: 'app-document-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionMenuComponent, BadgeComponent, RouterLink],
  templateUrl: './document-table.component.html',
  styleUrl: './document-table.component.scss',
})
export class DocumentTableComponent {
  readonly documents = input.required<readonly DocumentRecord[]>();
  readonly columns = input.required<readonly ResolvedTableColumn[]>();
  /** Azioni di gestione (duplica/elimina) mostrate solo con permesso DocumentsManage. */
  readonly canManage = input<boolean>(false);
  /** Selezione multipla per operazioni massive (lista Arrivi merce). */
  readonly selectable = input<boolean>(false);
  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());

  readonly rowClick = output<DocumentRecord>();
  readonly action = output<DocumentTableActionEvent>();
  readonly selectionChange = output<DocumentTableSelectionEvent>();
  readonly selectAllChange = output<boolean>();

  protected readonly allSelected = computed(() => {
    const docs = this.documents();
    const selected = this.selectedIds();
    return docs.length > 0 && docs.every((doc) => selected.has(doc.id));
  });

  protected readonly someSelected = computed(() => {
    const docs = this.documents();
    const selected = this.selectedIds();
    const count = docs.filter((doc) => selected.has(doc.id)).length;
    return count > 0 && count < docs.length;
  });

  protected readonly typeLabel = documentTypeLabel;
  protected readonly formatMoney = formatMoney;

  protected referenceLabel(doc: DocumentRecord): string {
    return documentReferenceLabel(doc.type, doc.reference, doc.series);
  }

  protected counterparty(doc: DocumentRecord): string {
    return doc.supplierName ?? doc.customerName ?? '—';
  }

  protected dateLabel(doc: DocumentRecord): string {
    return formatDate(doc.documentDate);
  }

  protected lineCount(doc: DocumentRecord): number {
    return doc.lineCount ?? doc.lines?.length ?? 0;
  }

  protected notesLabel(doc: DocumentRecord): string {
    return doc.internalComment?.trim() || doc.notes?.trim() || '—';
  }

  protected registrationDateLabel(doc: DocumentRecord): string {
    return doc.registrationDate ? formatDate(doc.registrationDate) : '—';
  }

  /** N. fattura fornitore (elenco Registrazioni fattura): solo il numero. */
  protected invoiceNumberLabel(doc: DocumentRecord): string {
    return doc.externalDocNumber?.trim() || '—';
  }

  /** "Ancora da saldare": importo residuo, null = tutto saldato (badge). */
  protected outstandingLabel(doc: DocumentRecord): string | null {
    const outstanding = doc.outstanding;
    if (!outstanding || outstanding.amountMinor <= 0) {
      return null;
    }
    return formatMoney(outstanding);
  }

  protected paymentMethodLabel(doc: DocumentRecord): string {
    const raw = doc.paymentMethod?.trim();
    if (!raw) {
      return '—';
    }
    // La cassa salva il codice (`cash`/`card`/`other`), i DDT lo snapshot
    // testuale della voce normativa: solo i primi vanno tradotti. «Altro»
    // mostra in coda l'eventuale descrizione libera.
    return isStoreFlowDocumentType(doc.type)
      ? storeSalePaymentMethodLabelWithNote(raw, doc.paymentMethodNote)
      : raw;
  }

  protected locationLabel(doc: DocumentRecord): string {
    return doc.locationName ?? '—';
  }

  /** "DDT 145 del 08/05/2026" quando tipo/data documento fornitore sono noti. */
  protected externalDocLabel(doc: DocumentRecord): string {
    return goodsReceiptExternalDocLabel(doc) || '—';
  }

  protected billingCauseLabel(doc: DocumentRecord): string {
    return doc.billingCause?.trim() || '—';
  }

  protected causalLabel(doc: DocumentRecord): string {
    return doc.causalText?.trim() || doc.billingCause?.trim() || '—';
  }

  protected linkStatusLabel(doc: DocumentRecord): string | null {
    return goodsReceiptLinkStatusLabel(doc);
  }

  protected linkStatusTone(doc: DocumentRecord) {
    return goodsReceiptLinkStatusTone(doc);
  }

  /** Fattura registrata collegata: la cella "Stato" diventa un link ad essa. */
  protected linkedInvoice(doc: DocumentRecord): LinkedPurchaseInvoiceInfo | null {
    return doc.linkStatus === 'linked' ? (doc.linkedPurchaseInvoice ?? null) : null;
  }

  protected statusLabel(doc: DocumentRecord): string | null {
    return documentStatusDisplayLabel(doc.type, doc.status, doc);
  }

  protected statusTone(doc: DocumentRecord) {
    return documentStatusDisplayTone(doc.type, doc.status);
  }

  protected rowLabel(doc: DocumentRecord): string {
    return `Apri documento ${this.referenceLabel(doc)} (${this.typeLabel(doc.type)})`;
  }

  /**
   * Voci del menu Azioni per la riga: solo quelle realmente disponibili per
   * questo tipo/stato documento — mai voci disabilitate silenziosamente.
   */
  protected rowActions(doc: DocumentRecord): readonly ActionMenuItem[] {
    // Vendite/resi negozio: il dettaglio è di sola lettura, mai una modifica.
    const items: ActionMenuItem[] = isStoreFlowDocumentType(doc.type)
      ? [{ id: 'open', label: 'Apri', icon: 'pi-eye' }]
      : [{ id: 'open', label: 'Apri / Modifica', icon: 'pi-pencil' }];

    if (this.canManage() && !isStoreFlowDocumentType(doc.type)) {
      items.push({ id: 'duplicate', label: 'Duplica', icon: 'pi-copy' });
    }
    if (isPrintableDocumentType(doc.type)) {
      items.push({ id: 'print', label: 'Stampa PDF', icon: 'pi-print' });
    }
    if (
      isGoodsReceiptDocumentType(doc.type) &&
      doc.status !== DocumentStatus.Cancelled &&
      doc.status !== DocumentStatus.Draft &&
      (doc.lineCount ?? 0) > 0
    ) {
      items.push({ id: 'labels', label: 'Etichette', icon: 'pi-tag' });
    }
    items.push({ id: 'attachments', label: 'Allegati', icon: 'pi-paperclip' });
    if (
      this.canManage() &&
      !isStoreFlowDocumentType(doc.type) &&
      (doc.status === DocumentStatus.Draft ||
        doc.status === DocumentStatus.Cancelled ||
        // Scarico manuale (prompt Scarico manuale): resta in elenco finché
        // l'operatore non lo elimina — l'eliminazione NON ripristina le
        // giacenze già scalate, quindi è disponibile in qualunque stato.
        isManualUnloadDocumentType(doc.type))
    ) {
      items.push({ id: 'delete', label: 'Elimina', icon: 'pi-trash', danger: true });
    }
    return items;
  }

  protected onAction(actionId: string, doc: DocumentRecord): void {
    this.action.emit({ action: actionId as DocumentTableActionId, doc });
  }

  protected onToggleSelect(doc: DocumentRecord, selected: boolean): void {
    this.selectionChange.emit({ doc, selected });
  }
}
