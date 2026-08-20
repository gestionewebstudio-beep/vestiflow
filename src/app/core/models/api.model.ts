// Contratti di risposta API e parametri di paginazione.

/** Metadati di paginazione (page 1-based). */
export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
  /**
   * ⭐ **La risposta è stata tagliata al tetto** delle liste senza pagine
   * (`14` §H14-bis).
   *
   * ⛔ Esiste perché una lista troncata in silenzio è peggio di una paginata:
   * sembra completa. Chi la riceve deve dirlo a schermo — «di `total` ne
   * vedi `pageSize`, restringi il periodo» — non ignorarla.
   */
  readonly truncated?: boolean;
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
