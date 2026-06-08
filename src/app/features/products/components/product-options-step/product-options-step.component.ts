import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';

import { OPTION_NAME_COLOR, OPTION_NAME_SIZE } from '../../models/product-form.model';
import type {
  OptionAxisDraft,
  ProductOptionsDraft,
  VariantDraft,
} from '../../models/product-form.model';
import {
  axisValues,
  selectedOptionValue,
  variantOptionNames,
} from '../../models/product-variant.util';
import { OptionListEditorComponent } from '../option-list-editor/option-list-editor.component';

// Nome di default proposto per il 3° asse opzionale (editabile dall'utente).
const DEFAULT_THIRD_AXIS_NAME = 'Materiale';
// Indice convenzionale del 3° asse: gli assi fissi Taglia/Colore restano 0 e 1.
const THIRD_AXIS_INDEX = 2;

/**
 * Step "Opzioni" del wizard (presentazionale). UX conservativa: due editor fissi
 * (Taglia/Colore) + un 3° asse opzionale con nome editabile (attivabile/
 * rimovibile). Internamente lavora sul modello generico `axes` (max 3). Le
 * modifiche sono propagate via `optionsChange`; generazione/merge varianti vive
 * nello smart. L'anteprima ha colonne dinamiche in base agli assi attivi.
 */
@Component({
  selector: 'app-product-options-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OptionListEditorComponent, ButtonComponent],
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

  // 3° asse opzionale: per convenzione è l'asse in posizione 2 (oltre i due fissi).
  protected readonly thirdAxis = computed<OptionAxisDraft | null>(
    () => this.options().axes[THIRD_AXIS_INDEX] ?? null,
  );
  protected readonly hasThirdAxis = computed(() => this.thirdAxis() !== null);
  protected readonly thirdAxisName = computed(() => this.thirdAxis()?.name ?? '');
  protected readonly thirdAxisValues = computed(() => this.thirdAxis()?.values ?? []);

  /** Errore inline sul nome del 3° asse (vuoto o duplicato di un asse fisso). */
  protected readonly thirdAxisError = computed<string | null>(() => {
    const axis = this.thirdAxis();
    if (!axis) {
      return null;
    }
    const name = axis.name.trim().toLowerCase();
    if (name === '') {
      return "Inserisci un nome per l'opzione.";
    }
    if (name === this.sizeName.toLowerCase() || name === this.colorName.toLowerCase()) {
      return "Nome gia' usato da un'altra opzione.";
    }
    return null;
  });

  /** Nomi colonna del preview, dinamici in base agli assi attivi nelle varianti. */
  protected readonly previewNames = computed(() => variantOptionNames(this.variants()));

  protected onSizesChange(values: readonly string[]): void {
    this.optionsChange.emit(this.withAxisByName(OPTION_NAME_SIZE, values));
  }

  protected onColorsChange(values: readonly string[]): void {
    this.optionsChange.emit(this.withAxisByName(OPTION_NAME_COLOR, values));
  }

  protected addThirdAxis(): void {
    if (this.hasThirdAxis()) {
      return;
    }
    const axes = [...this.options().axes, { name: DEFAULT_THIRD_AXIS_NAME, values: [] }];
    this.optionsChange.emit({ axes });
  }

  /**
   * Rimuove il 3° asse. Se ha valori e ci sono varianti generate, chiede conferma:
   * la rimozione collassa le combinazioni sulla coppia Taglia x Colore (vedi
   * regola di merge nel mapper) ed è quindi una perdita di dati.
   */
  protected removeThirdAxis(): void {
    const axis = this.thirdAxis();
    if (!axis) {
      return;
    }
    const willCollapse = axis.values.length > 0 && this.variants().length > 0;
    if (
      willCollapse &&
      !window.confirm("Rimuovere l'opzione? Le varianti collegate verranno rigenerate.")
    ) {
      return;
    }
    const axes = this.options().axes.filter((_, index) => index !== THIRD_AXIS_INDEX);
    this.optionsChange.emit({ axes });
  }

  protected onThirdNameChange(name: string): void {
    this.optionsChange.emit(this.replaceThirdAxis({ name, values: this.thirdAxisValues() }));
  }

  protected onThirdValuesChange(values: readonly string[]): void {
    this.optionsChange.emit(this.replaceThirdAxis({ name: this.thirdAxisName(), values }));
  }

  /** Valore della variante per l'asse indicato (per il preview). */
  protected optionValue(variant: VariantDraft, name: string): string {
    return selectedOptionValue(variant.optionValues, name);
  }

  /** Aggiorna i valori di un asse fisso per nome, preservando gli altri assi. */
  private withAxisByName(name: string, values: readonly string[]): ProductOptionsDraft {
    const axes = this.options().axes;
    const nextAxes = axes.some((axis) => axis.name === name)
      ? axes.map((axis) => (axis.name === name ? { ...axis, values } : axis))
      : [...axes, { name, values }];
    return { axes: nextAxes };
  }

  /** Sostituisce il 3° asse (indice 2) preservando gli assi fissi. */
  private replaceThirdAxis(axis: OptionAxisDraft): ProductOptionsDraft {
    const axes = this.options().axes.map((current, index) =>
      index === THIRD_AXIS_INDEX ? axis : current,
    );
    return { axes };
  }
}
