import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';

export interface ShopifyTaxonomyCategory {
  readonly id: string;
  readonly name: string;
  readonly fullName: string;
  readonly isLeaf: boolean;
}

interface TaxonomyCategoriesResponse {
  readonly items: readonly ShopifyTaxonomyCategory[];
}

const HTTP_TIMEOUT_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class ShopifyTaxonomyService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  listCategories(options: {
    readonly search?: string;
    readonly childrenOf?: string;
  }): Observable<readonly ShopifyTaxonomyCategory[]> {
    let params = new HttpParams();
    if (options.search?.trim()) {
      params = params.set('search', options.search.trim());
    }
    if (options.childrenOf?.trim()) {
      params = params.set('childrenOf', options.childrenOf.trim());
    }

    return this.http
      .get<TaxonomyCategoriesResponse>(`${this.config.apiBaseUrl}/shopify/taxonomy/categories`, {
        params,
      })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => response.items ?? []),
      );
  }
}
