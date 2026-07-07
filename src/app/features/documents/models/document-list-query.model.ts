import type { ParamMap } from '@angular/router';

import { DocumentStatus, DocumentType } from '@core/models/document.model';

export const DEFAULT_DOCUMENT_PAGE_SIZE = 20;
export const DOCUMENT_PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];

/** Profilo lista documenti (route data). */
export type DocumentListProfile = 'generic' | 'goods-receipt';

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
  readonly accountant?: boolean;
  readonly pendingInvoice?: boolean;
}

const TYPE_VALUES = new Set<string>(Object.values(DocumentType));
const STATUS_VALUES = new Set<string>(Object.values(DocumentStatus));
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
    accountant: params.get('accountant') === '1',
    pendingInvoice: params.get('pendingInvoice') === '1',
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value);
}
