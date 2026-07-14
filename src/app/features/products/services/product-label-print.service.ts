import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, forkJoin, from, map, of, switchMap, take } from 'rxjs';
import type { Observable } from 'rxjs';

import { buildLabelPrintDocument } from '../models/product-label-print-document.util';
import type { ProductLabelViewModel } from '../models/product-label.model';
import { toProductLabelViewModels } from '../models/product-label.mapper';

import { ProductService } from './product.service';

export interface DocumentLabelLineInput {
  readonly variantId?: string;
  readonly quantity: number;
}

/**
 * Numero di copie etichetta per articolo: sempre almeno 1, mai oltre 500
 * (limite foglio). Esportata per test unitari mirati (vedi spec).
 */
export function clampLabelCopies(quantity: number): number {
  return Math.min(Math.max(Math.floor(quantity), 1), 500);
}

/** Ripete ogni etichetta il numero di copie richiesto (default 1 = nessuna ripetizione). */
export function expandLabelCopies(
  labels: readonly ProductLabelViewModel[],
  copies: number,
): readonly ProductLabelViewModel[] {
  const count = clampLabelCopies(copies);
  if (count <= 1) {
    return labels;
  }
  const expanded: ProductLabelViewModel[] = [];
  for (const label of labels) {
    for (let i = 0; i < count; i += 1) {
      expanded.push(label);
    }
  }
  return expanded;
}

/**
 * Stampa etichette dalla lista prodotti. Apre subito una finestra di stampa
 * (gesto utente) e carica lì le etichette, senza passare dalla pagina anteprima.
 */
@Injectable({ providedIn: 'root' })
export class ProductLabelPrintService {
  private readonly productService = inject(ProductService);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private activePrintWindow: Window | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.closePrintWindow());
  }

  /**
   * Chiamare direttamente dal click sull'icona stampa in tabella. `copies`
   * permette di stampare più etichette per lo stesso articolo/variante in
   * un colpo solo (es. "5 etichette per questo SKU"), default 1.
   */
  triggerDirectPrint(productId: string, variantId?: string, copies = 1): void {
    this.triggerDirectPrintMany([productId], variantId, copies).pipe(take(1)).subscribe();
  }

  /**
   * Stampa etichette per uno o più prodotti in un unico documento (gesto
   * utente). `copiesPerItem` ripete ogni etichetta risolta (articolo o
   * singola variante se `variantId` è indicato) lo stesso numero di volte:
   * caso particolare copiesPerItem=1 (default) per un solo articolo.
   */
  triggerDirectPrintMany(
    productIds: readonly string[],
    variantId?: string,
    copiesPerItem = 1,
  ): Observable<void> {
    const uniqueIds = [...new Set(productIds.filter((id) => id.trim().length > 0))];
    if (uniqueIds.length === 0) {
      return of(undefined);
    }

    this.closePrintWindow();

    const printWindow = globalThis.open('', '_blank');
    if (!printWindow) {
      // Popup bloccato: fallback sulla pagina anteprima, portando con sé le
      // stesse copie richieste (query param letto da ProductLabelPrintComponent).
      const queryParams: Record<string, string | number> = {};
      if (variantId) {
        queryParams['variantId'] = variantId;
      }
      if (clampLabelCopies(copiesPerItem) > 1) {
        queryParams['copies'] = clampLabelCopies(copiesPerItem);
      }
      void this.router.navigate(['/app/products', uniqueIds[0], 'print-label'], {
        queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      });
      return of(undefined);
    }

    this.activePrintWindow = printWindow;
    printWindow.document.open();
    printWindow.document.write(
      '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Stampa etichette</title></head><body><p>Preparazione stampa…</p></body></html>',
    );
    printWindow.document.close();

    return forkJoin(
      uniqueIds.map((productId) =>
        forkJoin({
          product: this.productService.getProductById(productId),
          variants: this.productService.getProductVariants(productId),
        }),
      ),
    ).pipe(
      switchMap((results) =>
        from(
          this.printLabelsInWindow(
            printWindow,
            expandLabelCopies(
              results.flatMap((result) =>
                toProductLabelViewModels(result.product, result.variants, variantId),
              ),
              copiesPerItem,
            ),
          ),
        ),
      ),
      catchError(() => {
        this.closePrintWindow();
        return of(undefined);
      }),
    );
  }

  /** Stampa etichette dalle righe documento arrivo merce (C4). */
  printFromDocumentLines(lines: readonly DocumentLabelLineInput[]): Observable<void> {
    const stockLines = lines.filter(
      (line) => line.variantId && Number.isFinite(line.quantity) && line.quantity > 0,
    );
    if (stockLines.length === 0) {
      return of(undefined);
    }

    this.closePrintWindow();

    const printWindow = globalThis.open('', '_blank');
    if (!printWindow) {
      return of(undefined);
    }

    this.activePrintWindow = printWindow;
    printWindow.document.open();
    printWindow.document.write(
      '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Stampa etichette</title></head><body><p>Preparazione stampa…</p></body></html>',
    );
    printWindow.document.close();

    const uniqueVariantIds = [...new Set(stockLines.map((line) => line.variantId!))];

    return forkJoin(
      uniqueVariantIds.map((variantId) =>
        this.productService.searchVariantSummaries({ variantId }).pipe(
          switchMap((summaries) => {
            const summary = summaries[0];
            if (!summary) {
              return of([] as readonly ProductLabelViewModel[]);
            }
            return forkJoin({
              product: this.productService.getProductById(summary.productId),
              variants: this.productService.getProductVariants(summary.productId),
            }).pipe(
              map((result) => toProductLabelViewModels(result.product, result.variants, variantId)),
            );
          }),
          catchError(() => of([] as readonly ProductLabelViewModel[])),
        ),
      ),
    ).pipe(
      map((labelGroups) => {
        const byVariantId = new Map<string, ProductLabelViewModel>();
        for (const group of labelGroups) {
          for (const label of group) {
            byVariantId.set(label.variantId, label);
          }
        }
        const expanded: ProductLabelViewModel[] = [];
        for (const line of stockLines) {
          const label = byVariantId.get(line.variantId!);
          if (!label) {
            continue;
          }
          const copies = clampLabelCopies(line.quantity);
          for (let i = 0; i < copies; i += 1) {
            expanded.push(label);
          }
        }
        return expanded;
      }),
      switchMap((labels) =>
        from(this.printLabelsInWindow(printWindow, labels)).pipe(map(() => undefined)),
      ),
      catchError(() => {
        this.closePrintWindow();
        return of(undefined);
      }),
    );
  }

  private async printLabelsInWindow(
    printWindow: Window,
    labels: readonly ProductLabelViewModel[],
  ): Promise<void> {
    if (printWindow.closed) {
      this.activePrintWindow = null;
      return;
    }

    if (labels.length === 0) {
      this.closePrintWindow();
      return;
    }

    try {
      const html = await buildLabelPrintDocument(labels, this.document);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      const cleanup = (): void => {
        this.closePrintWindow();
      };

      printWindow.addEventListener('afterprint', cleanup, { once: true });

      const runPrint = (): void => {
        printWindow.focus();
        printWindow.print();
      };

      if (printWindow.document.readyState === 'complete') {
        runPrint();
      } else {
        printWindow.addEventListener('load', runPrint, { once: true });
      }
    } catch {
      this.closePrintWindow();
    }
  }

  private closePrintWindow(): void {
    if (this.activePrintWindow && !this.activePrintWindow.closed) {
      this.activePrintWindow.close();
    }
    this.activePrintWindow = null;
  }
}
