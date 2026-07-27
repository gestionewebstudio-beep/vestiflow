import type { EntityId } from '@core/models/common.model';
import { DocumentType } from '@core/models/document.model';

/** Contatore + valori calcolati, come restituito da GET /document-counters. */
export interface DocumentCounterView {
  readonly id: EntityId;
  readonly type: DocumentType;
  readonly series: string;
  readonly locationId: EntityId | null;
  readonly locationName: string | null;
  /** Prossimo numero = max+1 sui documenti reali (sola lettura). */
  readonly nextNumber: number;
  /** Documenti che usano questa numerazione (avviso spostamento/eliminazione). */
  readonly documentCount: number;
}

/** Corpo per creazione/modifica contatore. */
export interface SaveDocumentCounterBody {
  readonly type: DocumentType;
  readonly series: string;
  /** null = contatore globale (tutte le sedi). */
  readonly locationId: EntityId | null;
}

/**
 * Tipi documento con numerazione configurabile — mirror di
 * COUNTER_CONFIGURABLE_DOCUMENT_TYPES (api/src/documents/document-defaults.ts).
 * Il backend valida comunque: qui serve solo a popolare la tendina. Esclusi
 * l'ordine fornitore (numerato in supplier_orders) e la Fattura accompagnatoria
 * (condivide il numeratore della Fattura).
 */
export const COUNTER_CONFIGURABLE_TYPES: readonly DocumentType[] = [
  DocumentType.GoodsReceipt,
  DocumentType.SupplierDdt,
  DocumentType.SupplierInvoiceAccompanying,
  DocumentType.SupplierInvoice,
  DocumentType.ManualLoad,
  DocumentType.InitialLoad,
  DocumentType.SalesDdt,
  DocumentType.Transfer,
  DocumentType.ManualUnload,
  DocumentType.Adjustment,
  DocumentType.Inventory,
  DocumentType.Proforma,
  DocumentType.InvoiceDraft,
  DocumentType.StoreSale,
  DocumentType.StoreReturn,
  DocumentType.Quote,
];
