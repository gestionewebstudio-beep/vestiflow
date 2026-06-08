import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { OPTION_NAME_COLOR, OPTION_NAME_SIZE } from '../../models/product-form.model';
import type { ProductOptionsDraft, VariantDraft } from '../../models/product-form.model';
import { axisValues, selectedOptionValue } from '../../models/product-variant.util';
import { OptionListEditorComponent } from '../option-list-editor/option-list-editor.component';

/**
 * Step "Opzioni" del wizard prodotto (presentazionale). UX conservativa: due
 * option-list-editor (Taglia/Colore) che leggono/scrivono gli assi del modello
 * generico per nome. Le modifiche sono propagate via `optionsChange`; la
 * generazione/merge delle varianti vive nello smart. L'editor dinamico 1-3 assi
 * è rimandato al 9.1d.
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

  protected readonly sizeName = OPTION_NAME_SIZE;
  protected readonly colorName = OPTION_NAME_COLOR;

  protected readonly sizes = computed(() => axisValues(this.options().axes, OPTION_NAME_SIZE));
  protected readonly colors = computed(() => axisValues(this.options().axes, OPTION_NAME_COLOR));

  protected onSizesChange(values: readonly string[]): void {
    this.optionsChange.emit(this.withAxis(OPTION_NAME_SIZE, values));
  }

  protected onColorsChange(values: readonly string[]): void {
    this.optionsChange.emit(this.withAxis(OPTION_NAME_COLOR, values));
  }

  /** Valore della variante per l'asse indicato (per il preview). */
  protected optionValue(variant: VariantDraft, name: string): string {
    return selectedOptionValue(variant.optionValues, name);
  }

  /** Aggiorna i valori di un asse per nome, preservando gli altri assi. */
  private withAxis(name: string, values: readonly string[]): ProductOptionsDraft {
    const axes = this.options().axes;
    const nextAxes = axes.some((axis) => axis.name === name)
      ? axes.map((axis) => (axis.name === name ? { ...axis, values } : axis))
      : [...axes, { name, values }];
    return { axes: nextAxes };
  }
}
