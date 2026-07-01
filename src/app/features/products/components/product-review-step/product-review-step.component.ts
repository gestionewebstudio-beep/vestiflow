import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { ProductStatus } from '@core/models/product.model';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  isValidCompareAt,
  moneyFromMajor,
} from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { BadgeTone } from '@shared/components/badge/badge.component';

import type {
  OptionAxisDraft,
  ProductGeneralDraft,
  ProductOptionsDraft,
  VariantDraft,
} from '../../models/product-form.model';
import { productStatusLabel, productStatusTone } from '../../models/product-status.util';
import { selectedOptionValue, variantOptionNames } from '../../models/product-variant.util';

/**
 * Step "Riepilogo" del wizard (presentazionale). Mostra in sola lettura i dati
 * generali, le opzioni selezionate e l'elenco delle varianti generate prima del
 * salvataggio. Nessuna logica di submit: quella vive nello smart (8.7).
 */
@Component({
  selector: 'app-product-review-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './product-review-step.component.html',
  styleUrl: './product-review-step.component.scss',
})
export class ProductReviewStepComponent {
  readonly general = input.required<ProductGeneralDraft>();
  readonly options = input.required<ProductOptionsDraft>();
  readonly variants = input.required<readonly VariantDraft[]>();
  readonly showShopifyIntegration = input(false);

  protected readonly variantCount = computed(() => this.variants().length);

  // Assi attivi (con almeno un valore) per le chip di riepilogo, in ordine.
  protected readonly activeAxes = computed<readonly OptionAxisDraft[]>(() =>
    this.options().axes.filter((axis) => axis.values.length > 0),
  );

  // Colonne della tabella varianti, dinamiche dagli assi presenti nelle varianti.
  protected readonly optionNames = computed(() => variantOptionNames(this.variants()));

  /** Valore della variante per l'asse indicato (per la tabella di riepilogo). */
  protected optionValue(variant: VariantDraft, name: string): string {
    return selectedOptionValue(variant.optionValues, name);
  }

  protected statusLabel(status: ProductStatus): string {
    return productStatusLabel(status);
  }

  protected statusTone(status: ProductStatus): BadgeTone {
    return productStatusTone(status);
  }

  // Il draft del form tiene i prezzi in unità maggiori (ponte); qui li rendiamo
  // currency-aware via formatMoney, coerenti con la tabella varianti.
  protected formatPrice(value: number): string {
    return formatMoney(moneyFromMajor(value, DEFAULT_CURRENCY));
  }

  /** Prezzo barrato mostrato solo se presente e valido (> prezzo di vendita). */
  protected compareAtVisible(variant: VariantDraft): boolean {
    if (variant.compareAtPrice == null) {
      return false;
    }
    return isValidCompareAt(
      moneyFromMajor(variant.sellingPrice, DEFAULT_CURRENCY),
      moneyFromMajor(variant.compareAtPrice, DEFAULT_CURRENCY),
    );
  }
}
