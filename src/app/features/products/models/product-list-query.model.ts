import type { ParamMap } from '@angular/router';

import type { PageQuery, SortOrder } from '@core/models/api.model';
import { ProductStatus } from '@core/models/product.model';

/** Campi ordinabili della lista prodotti. */
export type ProductSortField = 'name' | 'brand' | 'category' | 'season' | 'status' | 'updatedAt';

/** Filtri contestuali della lista prodotti (regole-gestionale). */
export interface ProductFilters {
  readonly category?: string;
  readonly brand?: string;
  readonly season?: string;
  readonly status?: ProductStatus;
}

/** Filtri per export CSV (stessi filtri lista, senza paginazione). */
export type ProductExportQuery = ProductFilters & {
  readonly search?: string;
};

/** Query completa della lista prodotti: paginazione + ricerca + filtri. */
export interface ProductListQuery extends PageQuery, ProductFilters {
  readonly sort?: ProductSortField;
}

/** Opzioni filtro derivate dal catalogo (facets), per popolare i select. */
export interface ProductFilterOptions {
  readonly categories: readonly string[];
  readonly brands: readonly string[];
  readonly seasons: readonly string[];
}

/** Dimensione pagina di default per la lista prodotti. */
export const DEFAULT_PRODUCT_PAGE_SIZE = 10;

/** Dimensioni pagina selezionabili dall'utente. */
export const PRODUCT_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

/** Default applicati quando un parametro manca o non e' valido. */
export const DEFAULT_PRODUCT_SORT: ProductSortField = 'name';
export const DEFAULT_PRODUCT_ORDER: SortOrder = 'asc';

const SORT_FIELDS: readonly ProductSortField[] = [
  'name',
  'brand',
  'category',
  'season',
  'status',
  'updatedAt',
];

const STATUS_VALUES: readonly ProductStatus[] = Object.values(ProductStatus);

function parsePage(raw: string | null): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function parsePageSize(raw: string | null): number {
  const value = Number(raw);
  return (PRODUCT_PAGE_SIZE_OPTIONS as readonly number[]).includes(value)
    ? value
    : DEFAULT_PRODUCT_PAGE_SIZE;
}

function parseSort(raw: string | null): ProductSortField {
  return SORT_FIELDS.includes(raw as ProductSortField)
    ? (raw as ProductSortField)
    : DEFAULT_PRODUCT_SORT;
}

function parseStatus(raw: string | null): ProductStatus | undefined {
  return STATUS_VALUES.includes(raw as ProductStatus) ? (raw as ProductStatus) : undefined;
}

function trimmedOrUndefined(raw: string | null): string | undefined {
  const value = raw?.trim();
  return value ? value : undefined;
}

/**
 * Costruisce una ProductListQuery a partire dai query params dell'URL.
 * Pura e difensiva: valori mancanti o non validi cadono sui default.
 * Mantiene l'URL come unica fonte di verita' dello stato lista.
 */
export function parseProductListQuery(params: ParamMap): ProductListQuery {
  return {
    page: parsePage(params.get('page')),
    pageSize: parsePageSize(params.get('pageSize')),
    search: trimmedOrUndefined(params.get('search')),
    sort: parseSort(params.get('sort')),
    order: params.get('order') === 'desc' ? 'desc' : DEFAULT_PRODUCT_ORDER,
    category: trimmedOrUndefined(params.get('category')),
    brand: trimmedOrUndefined(params.get('brand')),
    season: trimmedOrUndefined(params.get('season')),
    status: parseStatus(params.get('status')),
  };
}
