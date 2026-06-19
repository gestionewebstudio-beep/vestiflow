import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin, take } from 'rxjs';

import { buildLabelPrintDocument } from '../models/product-label-print-document.util';
import { toProductLabelViewModels } from '../models/product-label.mapper';

import { ProductService } from './product.service';

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

  /** Chiamare direttamente dal click sull'icona stampa in tabella. */
  triggerDirectPrint(productId: string, variantId?: string): void {
    this.closePrintWindow();

    const printWindow = globalThis.open('', '_blank');
    if (!printWindow) {
      void this.router.navigate(['/app/products', productId, 'print-label'], {
        queryParams: variantId ? { variantId } : undefined,
      });
      return;
    }

    this.activePrintWindow = printWindow;
    printWindow.document.open();
    printWindow.document.write(
      '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Stampa etichette</title></head><body><p>Preparazione stampa…</p></body></html>',
    );
    printWindow.document.close();

    forkJoin({
      product: this.productService.getProductById(productId),
      variants: this.productService.getProductVariants(productId),
    })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          void this.printInWindow(printWindow, result.product, result.variants, variantId);
        },
        error: () => {
          this.closePrintWindow();
        },
      });
  }

  private async printInWindow(
    printWindow: Window,
    product: Parameters<typeof toProductLabelViewModels>[0],
    variants: Parameters<typeof toProductLabelViewModels>[1],
    variantId?: string,
  ): Promise<void> {
    if (printWindow.closed) {
      this.activePrintWindow = null;
      return;
    }

    const labels = toProductLabelViewModels(product, variants, variantId);
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
