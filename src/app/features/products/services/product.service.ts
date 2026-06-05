import { Injectable } from '@angular/core';
import { type Observable, delay, of, switchMap, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId } from '@core/models/common.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import type { Product } from '@core/models/product.model';

import type {
  ProductFilterOptions,
  ProductListQuery,
  ProductSortField,
} from '../models/product-list-query.model';
import { MOCK_PRODUCTS, MOCK_PRODUCT_VARIANTS } from './products.mock-data';

const LIST_LATENCY_MS = 500;
const DETAIL_LATENCY_MS = 400;
const OPTIONS_LATENCY_MS = 200;

// Sentinel di sviluppo: cercare "errore" forza un errore server (test stato error).
const ERROR_SENTINEL = 'errore';

/**
 * Accesso ai dati prodotti. Implementazione mock (in memoria) con paginazione
 * server-side simulata, filtri, ordinamento, latenza ed errori. Ritorna modelli
 * di dominio: sostituibile con un client HTTP senza cambiare l'API pubblica.
 */
@Injectable()
export class ProductService {
  /** Lista paginata, filtrata e ordinata (paginazione simulata lato "server"). */
  getProducts(query: ProductListQuery): Observable<PaginatedResponse<Product>> {
    if (this.shouldSimulateError(query)) {
      return of(null).pipe(
        delay(LIST_LATENCY_MS),
        switchMap(() => throwError(() => this.serverError())),
      );
    }

    const filtered = this.applyFilters(MOCK_PRODUCTS, query);
    const sorted = this.applySort(filtered, query.sort ?? 'name', query.order ?? 'asc');

    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const total = sorted.length;
    const start = (page - 1) * pageSize;
    const data = sorted.slice(start, start + pageSize);

    const response: PaginatedResponse<Product> = {
      data,
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };

    return of(response).pipe(delay(LIST_LATENCY_MS));
  }

  /**
   * Valori distinti per i filtri (facets). In un backend reale sarebbe un
   * endpoint dedicato; qui derivati dal catalogo mock e ordinati.
   */
  getFilterOptions(): Observable<ProductFilterOptions> {
    const options: ProductFilterOptions = {
      categories: this.distinctSorted(MOCK_PRODUCTS.map((product) => product.category)),
      brands: this.distinctSorted(MOCK_PRODUCTS.map((product) => product.brand)),
      seasons: this.distinctSorted(MOCK_PRODUCTS.map((product) => product.season)),
    };
    return of(options).pipe(delay(OPTIONS_LATENCY_MS));
  }

  /** Singolo prodotto per id; AppError NotFound se assente. */
  getProductById(id: EntityId): Observable<Product> {
    const product = MOCK_PRODUCTS.find((candidate) => candidate.id === id);
    if (!product) {
      return of(null).pipe(
        delay(DETAIL_LATENCY_MS),
        switchMap(() => throwError(() => this.notFoundError())),
      );
    }
    return of(product).pipe(delay(DETAIL_LATENCY_MS));
  }

  /**
   * Varianti di un prodotto. Hook tecnico per il dettaglio: lo stock per negozio
   * resta responsabilita' della feature Magazzino.
   */
  getProductVariants(productId: EntityId): Observable<readonly ProductVariant[]> {
    const variants = MOCK_PRODUCT_VARIANTS.filter((variant) => variant.productId === productId);
    return of(variants).pipe(delay(DETAIL_LATENCY_MS));
  }

  private distinctSorted(values: readonly (string | undefined)[]): readonly string[] {
    const unique = new Set<string>();
    for (const value of values) {
      if (value) {
        unique.add(value);
      }
    }
    return [...unique].sort((a, b) => a.localeCompare(b));
  }

  private applyFilters(products: readonly Product[], query: ProductListQuery): readonly Product[] {
    const search = query.search?.trim().toLowerCase();

    return products.filter((product) => {
      if (query.category && product.category !== query.category) {
        return false;
      }
      if (query.brand && product.brand !== query.brand) {
        return false;
      }
      if (query.season && product.season !== query.season) {
        return false;
      }
      if (query.status && product.status !== query.status) {
        return false;
      }
      if (search) {
        const haystack = `${product.name} ${product.brand ?? ''}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      return true;
    });
  }

  private applySort(
    products: readonly Product[],
    field: ProductSortField,
    order: 'asc' | 'desc',
  ): readonly Product[] {
    const direction = order === 'desc' ? -1 : 1;
    return [...products].sort((a, b) => this.compare(a, b, field) * direction);
  }

  private compare(a: Product, b: Product, field: ProductSortField): number {
    switch (field) {
      case 'updatedAt':
        return a.updatedAt.localeCompare(b.updatedAt);
      case 'status':
        return a.status.localeCompare(b.status);
      case 'brand':
        return (a.brand ?? '').localeCompare(b.brand ?? '');
      case 'category':
        return (a.category ?? '').localeCompare(b.category ?? '');
      case 'season':
        return (a.season ?? '').localeCompare(b.season ?? '');
      case 'name':
      default:
        return a.name.localeCompare(b.name);
    }
  }

  private shouldSimulateError(query: ProductListQuery): boolean {
    return query.search?.trim().toLowerCase() === ERROR_SENTINEL;
  }

  private serverError(): AppError {
    return {
      kind: AppErrorKind.Server,
      message: 'Errore nel caricamento dei prodotti. Riprova piu\u0027 tardi.',
      status: 500,
    };
  }

  private notFoundError(): AppError {
    return {
      kind: AppErrorKind.NotFound,
      message: 'Prodotto non trovato.',
      status: 404,
    };
  }
}
