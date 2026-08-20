import {
  parseDataTableSort,
  type DataTableSort,
} from '@shared/components/data-table/data-table.model';

import type { ParamMap } from '@angular/router';

import { DocumentStatus, DocumentType, GoodsReceiptLinkStatus } from '@core/models/document.model';

export const DEFAULT_DOCUMENT_PAGE_SIZE = 20;
export const DOCUMENT_PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];

/** Profilo lista documenti (route data). */
export type DocumentListProfile =
  | 'generic'
  | 'goods-receipt'
  | 'quote'
  | 'proforma'
  | 'sales-ddt'
  | 'manual-unload'
  // Elenco condiviso Fattura / Fattura accompagnatoria (ex 'invoice-draft').
  | 'invoice'
  | 'purchase-invoice'
  // Elenco condiviso Vendita / Reso al banco (documenti creati dalla loro maschera).
  | 'store-sale';

/** Query registro documenti (ordinamento fisso: data documento discendente). */
export interface DocumentListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  /** Ricerca libera su riferimento, controparti e numero documento esterno. */
  readonly search?: string;
  readonly type?: DocumentType;
  readonly types?: readonly DocumentType[];
  readonly status?: DocumentStatus;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly customerId?: string;
  readonly locationId?: string;
  readonly supplierId?: string;
  /** Stato collegamento fattura (solo liste Arrivi merce). */
  readonly linkStatus?: GoodsReceiptLinkStatus;
  /** Filtro tipo documento fornitore strutturato (DDT/Fattura/Reso/…, solo Arrivi merce). */
  readonly externalDocumentTypeId?: string;
  /** Stato saldo delle Registrazioni fattura (Da saldare / Saldati). */
  readonly settlement?: 'pending' | 'settled';
  /** Metodo di pagamento, confronto esatto sullo snapshot salvato. */
  readonly paymentMethod?: string;
  /** Operatore che ha creato il documento. */
  readonly createdById?: string;
  readonly pendingInvoice?: boolean;
  /**
   * Ordinamento richiesto, **nella grammatica del motore** (`14` §H15): le
   * chiavi in ordine di priorità.
   *
   * ⛔ Non `sortBy` + `sortDir`: quella coppia sa esprimere una chiave sola, e
   * l'ordinamento è a più chiavi da quando esiste il motore. Il parametro HTTP
   * è la **serializzazione** di questo array, non un formato suo.
   */
  readonly sort?: readonly DataTableSort[];
}

const TYPE_VALUES = new Set<string>(Object.values(DocumentType));
const STATUS_VALUES = new Set<string>(Object.values(DocumentStatus));
const LINK_STATUS_VALUES = new Set<string>(Object.values(GoodsReceiptLinkStatus));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parsing difensivo dei query param URL (URL = fonte di verità della lista). */
export function parseDocumentListQuery(params: ParamMap): DocumentListQuery {
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  const search = params.get('search')?.trim();
  const type = params.get('type') ?? '';
  const status = params.get('status') ?? '';
  const dateFrom = params.get('dateFrom') ?? '';
  const dateTo = params.get('dateTo') ?? '';
  const customerId = params.get('customerId') ?? '';
  const locationId = params.get('locationId') ?? '';
  const supplierId = params.get('supplierId') ?? '';
  const linkStatus = params.get('linkStatus') ?? '';
  const externalDocumentTypeId = params.get('externalDocumentTypeId') ?? '';
  const settlement = params.get('settlement') ?? '';
  const paymentMethod = params.get('paymentMethod')?.trim() ?? '';
  const createdById = params.get('createdById') ?? '';
  // L'ordinamento viaggia nell'URL come gli altri filtri: la pagina si condivide
  // e il «indietro» del browser ritrova l'ordine di prima.
  const sort = parseDataTableSort(params.get('sort'));

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize:
      Number.isInteger(pageSize) && DOCUMENT_PAGE_SIZE_OPTIONS.includes(pageSize)
        ? pageSize
        : DEFAULT_DOCUMENT_PAGE_SIZE,
    search: search || undefined,
    type: TYPE_VALUES.has(type) ? (type as DocumentType) : undefined,
    status: STATUS_VALUES.has(status) ? (status as DocumentStatus) : undefined,
    dateFrom: ISO_DATE.test(dateFrom) ? dateFrom : undefined,
    dateTo: ISO_DATE.test(dateTo) ? dateTo : undefined,
    customerId: isUuid(customerId) ? customerId : undefined,
    locationId: isUuid(locationId) ? locationId : undefined,
    supplierId: isUuid(supplierId) ? supplierId : undefined,
    linkStatus: LINK_STATUS_VALUES.has(linkStatus)
      ? (linkStatus as GoodsReceiptLinkStatus)
      : undefined,
    externalDocumentTypeId: isUuid(externalDocumentTypeId) ? externalDocumentTypeId : undefined,
    settlement: settlement === 'pending' || settlement === 'settled' ? settlement : undefined,
    paymentMethod: paymentMethod || undefined,
    createdById: isUuid(createdById) ? createdById : undefined,
    pendingInvoice: params.get('pendingInvoice') === '1',
    sort: sort.length > 0 ? sort : undefined,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value);
}
