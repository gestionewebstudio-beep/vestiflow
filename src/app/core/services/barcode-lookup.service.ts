import { Injectable, inject } from '@angular/core';
import { catchError, map, of, switchMap, take, type Observable } from 'rxjs';

import {
  parseBarcodeScanInput,
  type BarcodeScanInput,
} from '@core/utils/parse-barcode-scan-input.util';
import { ProductService } from '@features/products/services/product.service';

/** Opzioni di risoluzione: filtri di contesto + fallback locale del modulo. */
export interface BarcodeResolveOptions {
  readonly supplierId?: string;
  readonly locationId?: string;
  /**
   * Fallback specifico del modulo, valutato DOPO la ricerca per codice esatto
   * e PRIMA della ricerca libera con match esatto (es. Arrivo merce: mappa
   * SKU fornitore → variante). Ritorna l'id variante oppure null/undefined.
   */
  readonly localFallback?: (code: string) => string | null | undefined;
}

/**
 * Risoluzione condivisa dei codici da scanner (cassa, arrivo merce, …):
 * parsing input `N*codice` + risoluzione ESATTA codice → variante.
 * Catena: variante per codice (barcode/SKU) → fallback locale del modulo →
 * ricerca libera con match esatto su barcode/SKU. Nessun match parziale:
 * i comportamenti operativi (carrello, righe documento) restano nei moduli.
 */
@Injectable({ providedIn: 'root' })
export class BarcodeLookupService {
  private readonly productService = inject(ProductService);

  /** Parsing input lettore: `148*8001234567890` → quantità 148 + codice. */
  parseScanInput(raw: string): BarcodeScanInput {
    return parseBarcodeScanInput(raw);
  }

  /**
   * Risolve un codice scansionato nell'id variante con SOLO match esatti.
   * Errori HTTP degradano a `null` (codice non trovato): mai bloccante.
   */
  resolveVariantIdByCode(
    code: string,
    options: BarcodeResolveOptions = {},
  ): Observable<string | null> {
    const trimmed = code.trim();
    if (!trimmed) {
      return of(null);
    }
    return this.productService.findVariantByCode(trimmed).pipe(
      take(1),
      map((variant): string | null => variant.variantId),
      catchError(() => of<string | null>(null)),
      switchMap((variantId) => {
        if (variantId) {
          return of(variantId);
        }
        const localVariantId = options.localFallback?.(trimmed);
        if (localVariantId) {
          return of(localVariantId);
        }
        return this.searchExactVariantId(trimmed, options);
      }),
    );
  }

  /** Ricerca libera limitata: accetta SOLO corrispondenze esatte barcode/SKU. */
  private searchExactVariantId(
    code: string,
    options: BarcodeResolveOptions,
  ): Observable<string | null> {
    return this.productService
      .searchVariantSummaries({
        search: code,
        pageSize: 5,
        supplierId: options.supplierId,
        locationId: options.locationId,
      })
      .pipe(
        map((rows) => {
          const exactBarcode = rows.find((row) => row.barcode?.trim() === code);
          if (exactBarcode) {
            return exactBarcode.variantId;
          }
          const normalized = code.toUpperCase();
          const exactSku = rows.find((row) => row.sku.trim().toUpperCase() === normalized);
          return exactSku?.variantId ?? null;
        }),
        catchError(() => of(null)),
      );
  }
}
