import { Injectable, inject } from '@angular/core';
import { catchError, map, of, switchMap, take, type Observable } from 'rxjs';

import {
  parseBarcodeScanInput,
  type BarcodeScanInput,
} from '@core/utils/parse-barcode-scan-input.util';
import { ProductService } from '@domain/products/services/product.service';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

/**
 * L'unico elemento che soddisfa il criterio, oppure `null`. Zero risultati e
 * due risultati portano allo stesso esito: non c'è un articolo da richiamare.
 */
function onlyMatch(
  rows: readonly VariantSummary[],
  predicate: (row: VariantSummary) => boolean,
): string | null {
  const matches = rows.filter(predicate);
  return matches.length === 1 ? matches[0]!.variantId : null;
}

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

  /**
   * Ricerca libera limitata: accetta SOLO corrispondenze esatte, su tutte e
   * quattro le chiavi di identità dell'articolo.
   *
   * L'ordine non è casuale — è dal più specifico al più condiviso. L'EAN
   * identifica la variante; lo SKU pure, ma è nostro e riscrivibile; il codice
   * articolo identifica il PRODOTTO, quindi può valere per più varianti; il
   * codice fornitore vive sul legame Fornitore↔Variante, e fornitori diversi
   * possono usare lo stesso codice per articoli diversi. Sugli ultimi due si
   * accetta solo un risultato non ambiguo: indovinare fra due articoli è peggio
   * che lasciare la scelta a chi sta ordinando.
   */
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
          if (exactSku) {
            return exactSku.variantId;
          }
          return (
            onlyMatch(rows, (row) => row.articleCode?.trim().toUpperCase() === normalized) ??
            onlyMatch(rows, (row) => row.supplierSku?.trim().toUpperCase() === normalized)
          );
        }),
        catchError(() => of(null)),
      );
  }
}
