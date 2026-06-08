import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { ProductStatus } from '@core/models/product.model';
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

// Valuta fissa EUR finche' non arriva il contesto tenant/store (come variant-table).
const PRICE_FORMAT = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

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

  protected formatPrice(value: number): string {
    return PRICE_FORMAT.format(value);
  }
}
