import { Injectable } from '@angular/core';
import { type Observable, delay, of, switchMap, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId, IsoDateString } from '@core/models/common.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import type { Product, ProductOption } from '@core/models/product.model';

import type {
  CreateProductDto,
  CreateProductVariantDto,
  ProductOptionDto,
  SkuAvailabilityResult,
  UpdateProductDto,
  UpdateProductVariantDto,
} from '../models/product.dto';
import { findDuplicateSkus, normalizeSku } from '../models/product-form.validators';
import type {
  ProductFilterOptions,
  ProductListQuery,
  ProductSortField,
} from '../models/product-list-query.model';
import { MOCK_PRODUCTS, MOCK_PRODUCT_VARIANTS } from './products.mock-data';

const LIST_LATENCY_MS = 500;
const DETAIL_LATENCY_MS = 400;
const OPTIONS_LATENCY_MS = 200;
const WRITE_LATENCY_MS = 600;
const SKU_CHECK_LATENCY_MS = 300;

// Tenant corrente mock: in attesa del Tenant/Store context service. In produzione
// il tenant e' derivato lato backend dal token (regole-sicurezza).
const MOCK_TENANT_ID: EntityId = 'tenant-demo';

// Sentinel di sviluppo: cercare "errore" forza un errore server (test stato error).
const ERROR_SENTINEL = 'errore';

/**
 * Accesso ai dati prodotti. Implementazione mock (in memoria) con paginazione
 * server-side simulata, filtri, ordinamento, scrittura, latenza ed errori.
 * Ritorna modelli di dominio: sostituibile con un client HTTP (backend NestJS
 * su Railway, PostgreSQL su Supabase) senza cambiare l'API pubblica.
 */
@Injectable()
export class ProductService {
  // Store interno mutabile: create/update persistono per la sessione corrente.
  private products: Product[] = [...MOCK_PRODUCTS];
  private variants: ProductVariant[] = [...MOCK_PRODUCT_VARIANTS];

  /** Lista paginata, filtrata e ordinata (paginazione simulata lato "server"). */
  getProducts(query: ProductListQuery): Observable<PaginatedResponse<Product>> {
    if (this.shouldSimulateError(query)) {
      return of(null).pipe(
        delay(LIST_LATENCY_MS),
        switchMap(() => throwError(() => this.serverError())),
      );
    }

    const filtered = this.applyFilters(this.products, query);
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
      categories: this.distinctSorted(this.products.map((product) => product.category)),
      brands: this.distinctSorted(this.products.map((product) => product.brand)),
      seasons: this.distinctSorted(this.products.map((product) => product.season)),
    };
    return of(options).pipe(delay(OPTIONS_LATENCY_MS));
  }

  /** Singolo prodotto per id; AppError NotFound se assente. */
  getProductById(id: EntityId): Observable<Product> {
    const product = this.products.find((candidate) => candidate.id === id);
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
    const variants = this.variants.filter((variant) => variant.productId === productId);
    return of(variants).pipe(delay(DETAIL_LATENCY_MS));
  }

  /**
   * Verifica l'unicita' degli SKU lato "server". `excludeProductId` esclude le
   * varianti del prodotto in modifica, cosi' l'edit non si auto-blocca.
   */
  checkSkuAvailability(
    skus: readonly string[],
    excludeProductId?: EntityId,
  ): Observable<SkuAvailabilityResult> {
    const taken = this.findTakenSkus(skus, excludeProductId);
    return of<SkuAvailabilityResult>({ available: taken.length === 0, taken }).pipe(
      delay(SKU_CHECK_LATENCY_MS),
    );
  }

  /** Crea un prodotto con le sue varianti. 409 se uno SKU e' gia' in uso. */
  createProduct(dto: CreateProductDto): Observable<Product> {
    const conflict = this.validateSkus(dto.variants);
    if (conflict) {
      return of(null).pipe(
        delay(WRITE_LATENCY_MS),
        switchMap(() => throwError(() => conflict)),
      );
    }

    const now = this.now();
    const productId: EntityId = crypto.randomUUID();
    const product: Product = {
      id: productId,
      tenantId: MOCK_TENANT_ID,
      name: dto.name,
      description: dto.description,
      brand: dto.brand,
      category: dto.category,
      season: dto.season,
      status: dto.status,
      options: this.toOptions(dto.options),
      createdAt: now,
      updatedAt: now,
    };
    const newVariants = dto.variants.map((variant) =>
      this.toVariant(variant, productId, crypto.randomUUID()),
    );

    this.products = [product, ...this.products];
    this.variants = [...this.variants, ...newVariants];

    return of(product).pipe(delay(WRITE_LATENCY_MS));
  }

  /** Aggiorna un prodotto e ne rimpiazza il set di varianti. 404/409 gestiti. */
  updateProduct(id: EntityId, dto: UpdateProductDto): Observable<Product> {
    const existing = this.products.find((candidate) => candidate.id === id);
    if (!existing) {
      return of(null).pipe(
        delay(WRITE_LATENCY_MS),
        switchMap(() => throwError(() => this.notFoundError())),
      );
    }

    const incomingVariants = dto.variants ?? [];
    const conflict = this.validateSkus(incomingVariants, id);
    if (conflict) {
      return of(null).pipe(
        delay(WRITE_LATENCY_MS),
        switchMap(() => throwError(() => conflict)),
      );
    }

    const updated: Product = {
      ...existing,
      name: dto.name ?? existing.name,
      description: dto.description ?? existing.description,
      brand: dto.brand ?? existing.brand,
      category: dto.category ?? existing.category,
      season: dto.season ?? existing.season,
      status: dto.status ?? existing.status,
      options: dto.options ? this.toOptions(dto.options) : existing.options,
      updatedAt: this.now(),
    };
    const nextVariants = incomingVariants.map((variant) =>
      this.toVariant(variant, id, variant.id ?? crypto.randomUUID()),
    );

    this.products = this.products.map((product) => (product.id === id ? updated : product));
    this.variants = [
      ...this.variants.filter((variant) => variant.productId !== id),
      ...nextVariants,
    ];

    return of(updated).pipe(delay(WRITE_LATENCY_MS));
  }

  private toOptions(options: readonly ProductOptionDto[]): readonly ProductOption[] {
    return options.map((option) => ({ name: option.name, values: [...option.values] }));
  }

  private toVariant(
    dto: CreateProductVariantDto | UpdateProductVariantDto,
    productId: EntityId,
    id: EntityId,
  ): ProductVariant {
    return {
      id,
      productId,
      sku: dto.sku,
      size: dto.size,
      color: dto.color,
      sellingPrice: dto.sellingPrice,
      purchasePrice: dto.purchasePrice,
      barcode: dto.barcode,
      shopifyVariantId: dto.shopifyVariantId,
      shopifyInventoryItemId: dto.shopifyInventoryItemId,
    };
  }

  /** Duplicati intra-payload -> Validation; SKU gia' in uso -> Conflict. */
  private validateSkus(
    variants: readonly CreateProductVariantDto[],
    excludeProductId?: EntityId,
  ): AppError | null {
    const skus = variants.map((variant) => variant.sku);
    const duplicates = findDuplicateSkus(skus);
    if (duplicates.length > 0) {
      return this.duplicateSkuError(duplicates);
    }
    const taken = this.findTakenSkus(skus, excludeProductId);
    if (taken.length > 0) {
      return this.skuConflictError(taken);
    }
    return null;
  }

  private findTakenSkus(skus: readonly string[], excludeProductId?: EntityId): readonly string[] {
    const requested = new Set(skus.map(normalizeSku));
    const inUse = new Set<string>();
    for (const variant of this.variants) {
      if (excludeProductId && variant.productId === excludeProductId) {
        continue;
      }
      inUse.add(normalizeSku(variant.sku));
    }
    return [...requested].filter((sku) => inUse.has(sku));
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

  private now(): IsoDateString {
    return new Date().toISOString();
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

  private duplicateSkuError(duplicates: readonly string[]): AppError {
    return {
      kind: AppErrorKind.Validation,
      message: 'Sono presenti SKU duplicati tra le varianti.',
      status: 422,
      details: { duplicates },
    };
  }

  private skuConflictError(taken: readonly string[]): AppError {
    return {
      kind: AppErrorKind.Conflict,
      message: 'Alcuni SKU sono gia\u0027 in uso da altri prodotti.',
      status: 409,
      details: { taken },
    };
  }
}
