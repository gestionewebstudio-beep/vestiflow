import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { ProductOptionsDraft, VariantDraft } from '../../models/product-form.model';
import { OptionListEditorComponent } from '../option-list-editor/option-list-editor.component';

/**
 * Step "Opzioni" del wizard prodotto (presentazionale). Compone due
 * option-list-editor (taglie/colori) e propaga le modifiche al wizard via
 * `optionsChange`. La generazione/merge delle varianti vive nello smart (8.5e).
 */
@Component({
  selector: 'app-product-options-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OptionListEditorComponent],
  templateUrl: './product-options-step.component.html',
  styleUrl: './product-options-step.component.scss',
})
export class ProductOptionsStepComponent {
  readonly options = input.required<ProductOptionsDraft>();
  /** Anteprima (read-only) delle varianti generate dal wizard. */
  readonly variants = input<readonly VariantDraft[]>([]);
  readonly optionsChange = output<ProductOptionsDraft>();

  protected onSizesChange(sizes: readonly string[]): void {
    this.optionsChange.emit({ ...this.options(), sizes });
  }

  protected onColorsChange(colors: readonly string[]): void {
    this.optionsChange.emit({ ...this.options(), colors });
  }
}
