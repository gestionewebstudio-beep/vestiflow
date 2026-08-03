import type { EntityId } from '@core/models/common.model';
import { DocumentType } from '@core/models/document.model';

/** Contatore + valori calcolati, come restituito da GET /document-counters. */
export interface DocumentCounterView {
  readonly id: EntityId;
  readonly type: DocumentType;
  /** null = senza serie (riferimento senza il token serie). */
  readonly series: string | null;
  /** Attributo di disponibilità in testata; null = tutte le sedi. */
  readonly locationId: EntityId | null;
  readonly locationName: string | null;
  /** Contatore proposto in testata per il tipo (al più uno). */
  readonly isDefault: boolean;
  /** Prossimo numero = max+1 sui documenti reali (sola lettura). */
  readonly nextNumber: number;
  /** Documenti che usano questa numerazione (avviso eliminazione). */
  readonly documentCount: number;
}

/** Corpo per creazione/modifica contatore. */
export interface SaveDocumentCounterBody {
  readonly type: DocumentType;
  /** null = senza serie. */
  readonly series: string | null;
  /** null = tutte le sedi (attributo di disponibilità). */
  readonly locationId: EntityId | null;
  readonly isDefault?: boolean;
}

/**
 * Tipi documento con numerazione configurabile — mirror di
 * COUNTER_CONFIGURABLE_DOCUMENT_TYPES (api/src/documents/document-defaults.ts).
 * Il backend valida comunque: qui serve solo a popolare la tendina. Esclusa la
 * Fattura accompagnatoria (condivide il numeratore della Fattura). Gli ordini
 * (cliente/fornitore) usano il progressivo delle rispettive tabelle.
 */
export const COUNTER_CONFIGURABLE_TYPES: readonly DocumentType[] = [
  DocumentType.SupplierOrder,
  DocumentType.GoodsReceipt,
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
  DocumentType.CustomerOrder,
];
