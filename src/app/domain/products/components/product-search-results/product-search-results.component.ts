import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { StockStatus } from '@core/models/inventory-level.model';
import { stockStatusOf } from '@core/utils/inventory.util';
import { formatMoney } from '@core/utils/money.util';
import type { VariantSummary } from '../../models/variant-summary.model';

/**
 * Lista risultati ricerca articoli (miniatura, nome, codici, disponibilità
 * colorata, prezzo). Presentazionale e riusabile: la usa il pannello di ricerca
 * (Arrivo merce) e la ricerca inline dell'Ordine cliente mobile. Le varianti
 * arrivano già "piatte" (una riga per variante). Nessuna logica di ricerca qui.
 */
@Component({
  selector: 'app-product-search-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-search-results.component.html',
  styleUrl: './product-search-results.component.scss',
})
export class ProductSearchResultsComponent {
  readonly results = input.required<readonly VariantSummary[]>();
  /**
   * L'icona che apre la scheda articolo. Chi ospita la lista decide se
   * mostrarla: la scheda salva sul catalogo, quindi dove serve il permesso è
   * chi conosce l'operatore a spegnerla — questa lista resta presentazionale.
   */
  readonly canOpenDetail = input(true);
  readonly variantSelected = output<string>();
  /** Apri la scheda dell'articolo invece di aggiungerlo alla riga. */
  readonly detailRequested = output<string>();

  protected readonly StockStatus = StockStatus;

  protected pick(variantId: string): void {
    this.variantSelected.emit(variantId);
  }

  protected openDetail(productId: string): void {
    this.detailRequested.emit(productId);
  }

  /** Riga codici sotto il nome: codice articolo, SKU e EAN (i presenti). */
  protected resultCodes(variant: VariantSummary): string {
    const parts: string[] = [];
    if (variant.articleCode) {
      parts.push(`Art. ${variant.articleCode}`);
    }
    if (variant.sku) {
      parts.push(`SKU ${variant.sku}`);
    }
    if (variant.barcode) {
      parts.push(`EAN ${variant.barcode}`);
    }
    return parts.join(' · ');
  }

  /** Stato disponibilità; null se non gestito a magazzino o senza giacenza. */
  protected stockStatus(variant: VariantSummary): StockStatus | null {
    if (variant.managesStock === false || variant.stockAvailable == null) {
      return null;
    }
    return stockStatusOf({
      available: variant.stockAvailable,
      minThreshold: variant.stockMinThreshold ?? 0,
    });
  }

  protected stockLabel(variant: VariantSummary): string {
    if (this.stockStatus(variant) === StockStatus.Empty) {
      return 'Esaurito';
    }
    return `Disp. ${variant.stockAvailable}`;
  }

  protected priceLabel(variant: VariantSummary): string {
    return variant.sellingPrice.amountMinor > 0 ? formatMoney(variant.sellingPrice) : '';
  }
}
