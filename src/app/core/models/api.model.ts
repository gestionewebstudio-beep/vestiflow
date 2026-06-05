// Contratti di risposta API e parametri di paginazione.

/** Risposta API a singola risorsa. */
export interface ApiResponse<T> {
  readonly data: T;
}

/** Metadati di paginazione (page 1-based). */
export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

/** Risposta API paginata per liste. */
export interface PaginatedResponse<T> {
  readonly data: readonly T[];
  readonly meta: PageMeta;
}

export type SortOrder = 'asc' | 'desc';

/** Parametri di query per liste paginate/filtrate. */
export interface PageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly sort?: string;
  readonly order?: SortOrder;
}
