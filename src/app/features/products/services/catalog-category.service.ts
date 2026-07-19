import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import type { EntityId } from '@core/models/common.model';

const HTTP_TIMEOUT_MS = 15000;

/** Voce del vocabolario categorie/sottocategorie catalogo VestiFlow. */
export interface CatalogCategory {
  readonly id: EntityId;
  readonly name: string;
  /** null = categoria principale; valorizzato = sottocategoria della parent. */
  readonly parentId: EntityId | null;
}

/**
 * Vocabolario categorie/sottocategorie catalogo, gestito inline dal form
 * prodotto (crea/rinomina/elimina senza uscire dall'anagrafica). I prodotti
 * salvano i nomi come testo: il rename viene propagato dal backend.
 */
@Injectable({ providedIn: 'root' })
export class CatalogCategoryService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  private url(): string {
    return `${this.config.apiBaseUrl}/catalog-categories`;
  }

  list(): Observable<readonly CatalogCategory[]> {
    return this.http.get<readonly CatalogCategory[]>(this.url()).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  create(name: string, parentId: EntityId | null): Observable<CatalogCategory> {
    return this.http
      .post<CatalogCategory>(this.url(), { name, parentId: parentId ?? undefined })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  rename(id: EntityId, name: string): Observable<CatalogCategory> {
    return this.http
      .patch<CatalogCategory>(`${this.url()}/${id}`, { name })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  delete(id: EntityId): Observable<{ readonly ok: true }> {
    return this.http
      .delete<{ readonly ok: true }>(`${this.url()}/${id}`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
