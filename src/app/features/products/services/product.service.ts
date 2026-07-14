import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, map, of, type Observable, shareReplay, timeout, tap } from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import {
  mapProductApiRow,
  mapProductVariantApiRow,
  type ProductApiRow,
} from '@core/api/domain-api.mapper';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId } from '@core/models/common.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import type { ProductImage } from '@core/models/product-image.model';
import type { Product } from '@core/models/product.model';

import type { VariantSummary } from '../models/variant-summary.model';
import type {
  BarcodeAvailabilityResult,
  CreateProductDto,
  GenerateSkuRequestDto,
  GenerateSkuResultDto,
  SkuAvailabilityResult,
  UpdateProductDto,
  VariantByCodeDto,
} from '../models/product.dto';
import type {
  ProductFilterOptions,
  ProductExportQuery,
  ProductListQuery,
} from '../models/product-list-query.model';
import type { ProductImportPreview, ProductImportResult } from '../models/product-import.model';
import {
  mapProductImportPreview,
  type ImportPreviewApiResponse,
} from '../models/product-import.mapper';
import { PRODUCT_SEASON_STANDARD_VALUES } from '../models/product-season.options';
import { toCreateProductBody, toUpdateProductBody } from './product-api.mapper';

const HTTP_TIMEOUT_MS = 15000;
const EXPORT_HTTP_TIMEOUT_MS = 120_000;
/** Import CSV: la creazione di molti prodotti/varianti può richiedere minuti. */
const IMPORT_HTTP_TIMEOUT_MS = 300_000;
/** Push Shopify con metaobject categoria: può richiedere decine di secondi. */
const SHOPIFY_SYNC_HTTP_TIMEOUT_MS = 120_000;
const FILTER_OPTIONS_CACHE_MS = 5 * 60_000;
const DEFAULT_VARIANT_SUMMARY_PAGE_SIZE = 25;

interface ProductFacetsApiRow {
  readonly categories: readonly string[];
  readonly brands: readonly string[];
  readonly seasons: readonly string[];
}

interface VariantSummaryApiRow {
  readonly variantId: EntityId;
  readonly productId: EntityId;
  readonly sku: string;
  readonly productName: string;
  readonly title: string;
  readonly barcode?: string | null;
  readonly sellingPrice: { readonly amountMinor: number; readonly currencyCode: string };
  readonly purchasePrice?: {
    readonly amountMinor: number;
    readonly currencyCode: string;
  } | null;
  readonly compareAtPrice?: {
    readonly amountMinor: number;
    readonly currencyCode: string;
  } | null;
  readonly supplierSku?: string | null;
  readonly stockOnHand?: number | null;
  readonly category?: string | null;
  readonly unitOfMeasure?: string | null;
  readonly defaultVatCodeId?: string | null;
}

export interface VariantSummarySearchQuery {
  readonly search?: string;
  readonly variantId?: EntityId;
  readonly supplierId?: EntityId;
  readonly locationId?: EntityId;
  readonly page?: number;
  readonly pageSize?: number;
}

interface TimedCache<T> {
  readonly expiresAt: number;
  readonly value$: Observable<T>;
}

/**
 * Accesso HTTP ai prodotti (NestJS + Supabase). Sostituisce il mock in-memory
 * mantenendo la stessa API pubblica per i componenti smart.
 */
@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  private filterOptionsCache: TimedCache<ProductFilterOptions> | null = null;

  getProducts(query: ProductListQuery): Observable<PaginatedResponse<Product>> {
    let params = new HttpParams()
      .set('page', String(query.page))
      .set('pageSize', String(query.pageSize));

    if (query.search) params = params.set('search', query.search);
    if (query.status) params = params.set('status', query.status);
    if (query.category) params = params.set('category', query.category);
    if (query.brand) params = params.set('brand', query.brand);
    if (query.season) params = params.set('season', query.season);

    return this.http.get<ApiPaginated<ProductApiRow>>(this.url('/products'), { params }).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((response) => {
        const paginated = toPaginatedResponse(response);
        return {
          data: paginated.data.map(mapProductApiRow),
          meta: paginated.meta,
        };
      }),
    );
  }

  getFilterOptions(): Observable<ProductFilterOptions> {
    if (!this.filterOptionsCache || this.filterOptionsCache.expiresAt <= Date.now()) {
      this.filterOptionsCache = {
        expiresAt: Date.now() + FILTER_OPTIONS_CACHE_MS,
        value$: this.http.get<ProductFacetsApiRow>(this.url('/products/facets')).pipe(
          timeout(HTTP_TIMEOUT_MS),
          map((facets) => this.mergeFilterOptions(facets)),
          shareReplay({ bufferSize: 1, refCount: false }),
        ),
      };
    }
    return this.filterOptionsCache.value$;
  }

  getProductById(id: EntityId): Observable<Product> {
    return this.http
      .get<ProductApiRow>(this.url(`/products/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapProductApiRow));
  }

  getProductVariants(productId: EntityId): Observable<readonly ProductVariant[]> {
    return this.http.get<ProductApiRow>(this.url(`/products/${productId}`)).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((row) => (row.variants ?? []).map(mapProductVariantApiRow)),
    );
  }

  searchVariantSummaries(
    query: VariantSummarySearchQuery = {},
  ): Observable<readonly VariantSummary[]> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? DEFAULT_VARIANT_SUMMARY_PAGE_SIZE));

    if (query.search?.trim()) {
      params = params.set('search', query.search.trim());
    }
    if (query.variantId) {
      params = params.set('variantId', query.variantId);
    }
    if (query.supplierId) {
      params = params.set('supplierId', query.supplierId);
    }
    if (query.locationId) {
      params = params.set('locationId', query.locationId);
    }

    return this.http
      .get<ApiPaginated<VariantSummaryApiRow>>(this.url('/products/variants/summaries'), {
        params,
      })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => response.items.map((row) => this.mapVariantSummaryApiRow(row))),
      );
  }

  invalidateVariantSummariesCache(): void {
    this.filterOptionsCache = null;
  }

  findVariantByCode(code: string): Observable<VariantByCodeDto> {
    const params = new HttpParams().set('code', code.trim());
    return this.http
      .get<VariantByCodeDto>(this.url('/products/variants/by-code'), { params })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  checkSkuAvailability(
    skus: readonly string[],
    excludeProductId?: EntityId,
  ): Observable<SkuAvailabilityResult> {
    if (skus.length === 0) {
      return of({ available: true, taken: [] as readonly string[] });
    }

    const checks = skus.map((sku) => {
      let params = new HttpParams().set('sku', sku.trim());
      if (excludeProductId) {
        params = params.set('excludeProductId', excludeProductId);
      }
      return this.http
        .get<{ sku: string; available: boolean }>(this.url('/products/sku-availability'), {
          params,
        })
        .pipe(timeout(HTTP_TIMEOUT_MS));
    });

    return forkJoin(checks).pipe(
      map((results) => {
        const taken = results.filter((result) => !result.available).map((result) => result.sku);
        return { available: taken.length === 0, taken };
      }),
    );
  }

  /**
   * Anteprima "Genera SKU" (specifica cliente §SKU): il backend calcola un
   * codice prevedibile e ne risolve già l'unicità nel tenant. Non salva
   * nulla: l'utente può ancora modificare il codice proposto prima di
   * salvare il prodotto.
   */
  generateSku(payload: GenerateSkuRequestDto): Observable<GenerateSkuResultDto> {
    return this.http
      .post<GenerateSkuResultDto>(this.url('/products/sku/generate'), payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  checkBarcodeAvailability(
    barcodes: readonly string[],
    excludeProductId?: EntityId,
  ): Observable<BarcodeAvailabilityResult> {
    const normalized = barcodes
      .map((barcode) => barcode.trim())
      .filter((barcode) => barcode.length > 0);
    if (normalized.length === 0) {
      return of({ available: true, taken: [] as readonly string[] });
    }

    const checks = normalized.map((barcode) => {
      let params = new HttpParams().set('barcode', barcode);
      if (excludeProductId) {
        params = params.set('excludeProductId', excludeProductId);
      }
      return this.http
        .get<{ barcode: string; available: boolean }>(this.url('/products/barcode-availability'), {
          params,
        })
        .pipe(timeout(HTTP_TIMEOUT_MS));
    });

    return forkJoin(checks).pipe(
      map((results) => {
        const taken = results.filter((result) => !result.available).map((result) => result.barcode);
        return { available: taken.length === 0, taken };
      }),
    );
  }

  createProduct(dto: CreateProductDto): Observable<Product> {
    return this.http.post<ProductApiRow>(this.url('/products'), toCreateProductBody(dto)).pipe(
      timeout(HTTP_TIMEOUT_MS),
      tap(() => this.invalidateVariantSummariesCache()),
      map(mapProductApiRow),
    );
  }

  updateProduct(id: EntityId, dto: UpdateProductDto): Observable<Product> {
    return this.http
      .patch<ProductApiRow>(this.url(`/products/${id}`), toUpdateProductBody(dto))
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        tap(() => this.invalidateVariantSummariesCache()),
        map(mapProductApiRow),
      );
  }

  deleteProduct(id: EntityId): Observable<void> {
    return this.http.delete<void>(this.url(`/products/${id}`)).pipe(
      timeout(HTTP_TIMEOUT_MS),
      tap(() => this.invalidateVariantSummariesCache()),
    );
  }

  /** Duplica anagrafica prodotto: nuovo id, SKU con suffisso "-COPIA", barcode vuoto. */
  duplicateProduct(id: EntityId): Observable<Product> {
    return this.http.post<ProductApiRow>(this.url(`/products/${id}/duplicate`), {}).pipe(
      timeout(HTTP_TIMEOUT_MS),
      tap(() => this.invalidateVariantSummariesCache()),
      map(mapProductApiRow),
    );
  }

  uploadProductImage(productId: EntityId, file: File): Observable<ProductImage> {
    const body = new FormData();
    body.append('file', file);
    return this.http
      .post<{
        id: string;
        url: string;
        altText?: string | null;
        sortOrder: number;
      }>(this.url(`/products/${productId}/images`), body)
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((row) => ({
          id: row.id,
          url: row.url,
          altText: row.altText ?? undefined,
          sortOrder: row.sortOrder,
        })),
      );
  }

  deleteProductImage(productId: EntityId, imageId: EntityId): Observable<void> {
    return this.http
      .delete<void>(this.url(`/products/${productId}/images/${imageId}`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  syncProductToShopify(productId: EntityId): Observable<{
    readonly pushed: boolean;
    readonly reason?: string;
    readonly followUpInBackground?: boolean;
  }> {
    return this.http
      .post<{
        pushed: boolean;
        reason?: string;
        followUpInBackground?: boolean;
      }>(this.url(`/products/${productId}/sync-shopify`), {})
      .pipe(timeout(SHOPIFY_SYNC_HTTP_TIMEOUT_MS));
  }

  previewProductImport(file: File): Observable<ProductImportPreview> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http
      .post<ImportPreviewApiResponse>(this.url('/products/import/preview'), formData)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapProductImportPreview));
  }

  importProducts(file: File, handles?: readonly string[]): Observable<ProductImportResult> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (handles?.length) {
      formData.append('handles', JSON.stringify([...handles]));
    }
    return this.http
      .post<ProductImportResult>(this.url('/products/import'), formData)
      .pipe(timeout(IMPORT_HTTP_TIMEOUT_MS));
  }

  exportProductsCsv(query: ProductExportQuery): Observable<Blob> {
    let params = new HttpParams();
    if (query.search) params = params.set('search', query.search);
    if (query.status) params = params.set('status', query.status);
    if (query.category) params = params.set('category', query.category);
    if (query.brand) params = params.set('brand', query.brand);
    if (query.season) params = params.set('season', query.season);

    return this.http
      .get(this.url('/products/export/csv'), { params, responseType: 'blob' })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }

  private mergeFilterOptions(facets: ProductFacetsApiRow): ProductFilterOptions {
    return {
      categories: this.distinctSorted(facets.categories),
      brands: this.distinctSorted(facets.brands),
      seasons: this.distinctSorted([...PRODUCT_SEASON_STANDARD_VALUES, ...facets.seasons]),
    };
  }

  private mapVariantSummaryApiRow(row: VariantSummaryApiRow): VariantSummary {
    return {
      variantId: row.variantId,
      productId: row.productId,
      sku: row.sku,
      productName: row.productName,
      title: row.title,
      barcode: row.barcode ?? undefined,
      sellingPrice: {
        amountMinor: row.sellingPrice.amountMinor,
        currencyCode: row.sellingPrice.currencyCode,
      },
      purchasePrice: row.purchasePrice
        ? {
            amountMinor: row.purchasePrice.amountMinor,
            currencyCode: row.purchasePrice.currencyCode,
          }
        : undefined,
      compareAtPrice: row.compareAtPrice
        ? {
            amountMinor: row.compareAtPrice.amountMinor,
            currencyCode: row.compareAtPrice.currencyCode,
          }
        : undefined,
      supplierSku: row.supplierSku ?? undefined,
      stockOnHand: row.stockOnHand ?? undefined,
      category: row.category?.trim() || undefined,
      unitOfMeasure: row.unitOfMeasure?.trim() || undefined,
      defaultVatCodeId: row.defaultVatCodeId ?? undefined,
    };
  }

  private distinctSorted(values: readonly (string | undefined)[]): readonly string[] {
    const unique = new Set<string>();
    for (const value of values) {
      if (value) unique.add(value);
    }
    return [...unique].sort((a, b) => a.localeCompare(b));
  }
}
