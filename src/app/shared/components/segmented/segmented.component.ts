import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Opzione del controllo segmented. */
export interface SegmentedOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Controllo segmented (restyle spec §Dashboard): alternativa compatta al
 * select quando le opzioni sono poche e sempre visibili (es. periodo KPI).
 * Dumb puro: opzioni e valore via input(), scelta via output().
 */
@Component({
  selector: 'app-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './segmented.component.html',
  styleUrl: './segmented.component.scss',
})
export class SegmentedComponent {
  readonly options = input.required<readonly SegmentedOption[]>();
  readonly value = input<string | null>(null);
  readonly ariaLabel = input.required<string>();

  /**
   * Senza la traccia bordata: serve quando il controllo vive GIÀ dentro un
   * contenitore con bordo — un pannello, una card — dove il riquadro attorno
   * ai pulsanti diventa un secondo livello che non separa niente.
   */
  readonly flat = input<boolean>(false);

  readonly valueChange = output<string>();

  protected isActive(option: SegmentedOption): boolean {
    return (this.value() ?? '') === option.value;
  }

  protected select(option: SegmentedOption): void {
    if (!this.isActive(option)) {
      this.valueChange.emit(option.value);
    }
  }
}
