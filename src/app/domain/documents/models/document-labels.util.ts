// Etichette e toni display per tipi e stati documento (it-IT).

import type { IsoDateString } from '@core/models/common.model';
import { DocumentStatus, DocumentType, type DocumentRecord } from '@core/models/document.model';
import { formatDate } from '@core/utils/date.util';
import type { BadgeTone } from '@shared/components/badge/badge.component';

import { isOperationalDocumentType } from './document-operational.util';
import { isSalesInvoiceDocumentType } from './document-sales.util';

const TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.SupplierOrder]: 'Ordine fornitore',
  [DocumentType.GoodsReceipt]: 'Arrivo merce',
  // Disambiguata dall'omonima di vendita (InvoiceAccompanying): nel registro
  // generico le due comparirebbero altrimenti con la stessa etichetta.
  [DocumentType.SupplierInvoice]: 'Fattura fornitore',
  [DocumentType.ManualLoad]: 'Carico manuale',
  [DocumentType.InitialLoad]: 'Carico iniziale',
  [DocumentType.SalesDdt]: 'DDT vendita',
  [DocumentType.Transfer]: 'Trasferimento',
  // ⭐ «Vendita manuale», non «Scarico manuale»: e' una vendita inserita a
  // mano che riduce la giacenza SENZA generare movimenti di magazzino
  // (proprietario, 26/08/2026). Il nome vecchio spingeva verso Trasferimenti e
  // Rettifiche, e aveva gia' fatto spegnere il Listino su questo documento.
  [DocumentType.ManualUnload]: 'Vendita manuale',
  [DocumentType.Adjustment]: 'Rettifica',
  [DocumentType.Inventory]: 'Inventario',
  [DocumentType.Proforma]: 'Proforma',
  [DocumentType.Invoice]: 'Fattura',
  [DocumentType.InvoiceAccompanying]: 'Fattura accompagnatoria',
  [DocumentType.CreditNote]: 'Nota di credito',
  [DocumentType.StoreSale]: 'Vendita al banco',
  [DocumentType.StoreReturn]: 'Reso vendita al banco',
  [DocumentType.Quote]: 'Preventivo',
  [DocumentType.CustomerOrder]: 'Ordine cliente',
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.Draft]: 'Bozza',
  [DocumentStatus.Confirmed]: 'Confermato',
  [DocumentStatus.Printed]: 'Stampato',
  [DocumentStatus.Sent]: 'Inviato',
  [DocumentStatus.Cancelled]: 'Annullato',
};

const STATUS_TONES: Record<DocumentStatus, BadgeTone> = {
  [DocumentStatus.Draft]: 'neutral',
  [DocumentStatus.Confirmed]: 'success',
  [DocumentStatus.Printed]: 'info',
  [DocumentStatus.Sent]: 'info',
  [DocumentStatus.Cancelled]: 'error',
};

export function documentTypeLabel(type: DocumentType): string {
  return TYPE_LABELS[type];
}

export function documentStatusLabel(status: DocumentStatus): string {
  return STATUS_LABELS[status];
}

/** Etichetta stato contestuale al tipo (es. fattura / stati fiscali B6). */
export function documentStatusLabelForType(
  type: DocumentType,
  status: DocumentStatus,
  doc: Pick<DocumentRecord, 'externallyIssuedAt'>,
): string {
  // Stati fiscali di Fattura e Fattura accompagnatoria. `Sent` non è più
  // raggiungibile e resta mappato solo per i documenti storici che lo hanno già.
  //
  // ⚠️ `ExternallyRegistered` non esiste più (16/08/2026): l'azione «Inviata
  // al commercialista» è stata rimossa e i due arrivi merce che lo portavano
  // sono tornati `confirmed`. Il valore resta nel tipo PostgreSQL, morto.
  if (isSalesInvoiceDocumentType(type)) {
    if (status === DocumentStatus.Sent && doc.externallyIssuedAt) {
      return 'Emessa esternamente';
    }
    if (status === DocumentStatus.Sent) {
      return 'Inviata al commercialista';
    }
    if (
      status === DocumentStatus.Confirmed ||
      status === DocumentStatus.Printed ||
      status === DocumentStatus.Draft
    ) {
      return status === DocumentStatus.Draft ? 'Bozza' : 'Da emettere';
    }
  }
  return documentStatusLabel(status);
}

export function documentStatusTone(status: DocumentStatus): BadgeTone {
  return STATUS_TONES[status];
}

/**
 * Etichetta stato per UI: null = nessun badge (es. documenti operativi salvati non numerati).
 */
export function documentStatusDisplayLabel(
  type: DocumentType,
  status: DocumentStatus,
  doc: Pick<DocumentRecord, 'externallyIssuedAt'> = { externallyIssuedAt: undefined },
): string | null {
  // Preventivo: nessuno stato documento (resta visibile solo l'annullamento).
  if (type === DocumentType.Quote) {
    return status === DocumentStatus.Cancelled ? 'Annullato' : null;
  }
  if (isOperationalDocumentType(type)) {
    if (status === DocumentStatus.Draft) {
      return null;
    }
    if (status === DocumentStatus.Cancelled) {
      return 'Annullato';
    }
    if (status === DocumentStatus.Confirmed) {
      return 'Confermato';
    }
    return documentStatusLabel(status);
  }
  return documentStatusLabelForType(type, status, doc);
}

export function documentStatusDisplayTone(
  type: DocumentType,
  status: DocumentStatus,
): BadgeTone | null {
  if (type === DocumentType.Quote && status !== DocumentStatus.Cancelled) {
    return null;
  }
  if (isOperationalDocumentType(type) && status === DocumentStatus.Draft) {
    return null;
  }
  return documentStatusTone(status);
}

/**
 * Stato collegamento fattura di un Arrivo merce (colonna "Stato" della lista):
 * la colonna è puramente informativa. Vuota finché nessuna fattura registrata
 * include l'arrivo; "Fattura forn. n. 45 del 17/08/2025" quando è collegato;
 * "Annullato" se il documento è annullato.
 */
export function goodsReceiptLinkStatusLabel(
  doc: Pick<DocumentRecord, 'linkStatus' | 'linkedPurchaseInvoice'>,
): string | null {
  switch (doc.linkStatus) {
    case 'cancelled':
      return 'Annullato';
    case 'linked': {
      const invoice = doc.linkedPurchaseInvoice;
      const number = invoice?.externalDocNumber?.trim() || invoice?.reference?.trim();
      const date = invoice?.externalDocDate ?? invoice?.documentDate;
      const base = number ? `Fattura forn. n. ${number}` : 'Fattura fornitore';
      return date ? `${base} del ${formatDate(date)}` : base;
    }
    // 'suspended' non produce testo: il campo resta vuoto finché la fattura
    // non viene registrata e collegata da "Includi documento".
    default:
      return null;
  }
}

export function goodsReceiptLinkStatusTone(
  doc: Pick<DocumentRecord, 'linkStatus'>,
): BadgeTone | null {
  switch (doc.linkStatus) {
    case 'cancelled':
      return 'error';
    case 'linked':
      return 'success';
    default:
      return null;
  }
}

/**
 * I tre campi del documento emesso dalla controparte (il DDT del fornitore, la
 * fattura, l'ordine del cliente). Forma strutturale e non `DocumentRecord`: la
 * stessa terna vive anche sugli ordini cliente e sugli ordini fornitore, che
 * non sono `Document`.
 */
export interface CounterpartyDocRef {
  /** Etichetta del tipo fotografata al salvataggio (es. 'DDT', 'Fatt.'). */
  readonly externalDocumentTypeSnapshot?: string;
  readonly externalDocNumber?: string;
  readonly externalDocDate?: IsoDateString;
}

/**
 * «DDT 145 del 8 mag 2026»: il documento della controparte in una voce sola.
 *
 * L'etichetta del tipo viene dallo SNAPSHOT scritto sul documento, mai
 * dall'elenco dei tipi: un tipo eliminato sparisce dalle tendine ma resta sui
 * documenti che lo portano, e chi li legge deve continuare a dirlo.
 *
 * Restituisce '' quando non c'è nessuno dei tre campi, così chi chiama sa che la
 * riga non va stampata affatto: l'interfaccia è densa per scelta, e un «—» in
 * più su ogni documento è rumore.
 *
 * Sta in `domain/` e non nelle utility di una feature perché la leggono elenco
 * documenti, dettagli, anteprima di stampa E il dettaglio dell'ordine fornitore,
 * che vive in un'altra feature: da lì non potrebbe importarla, e se ne
 * riscriverebbe una copia — come infatti era successo.
 */
export function counterpartyDocLabel(doc: CounterpartyDocRef): string {
  const head = [doc.externalDocumentTypeSnapshot, doc.externalDocNumber]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ');
  if (!doc.externalDocDate) {
    return head;
  }
  const date = formatDate(doc.externalDocDate);
  return head ? `${head} del ${date}` : date;
}

/** Etichetta breve del documento in lista. */
export function documentReferenceLabel(
  type: DocumentType,
  reference: string | undefined,
  series: string,
): string {
  if (reference) {
    return reference;
  }
  if (isOperationalDocumentType(type)) {
    return `Serie ${series} (non numerato)`;
  }
  return `Bozza · serie ${series}`;
}
