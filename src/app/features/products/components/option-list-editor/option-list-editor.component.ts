import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';

// Contatore per id univoci (label/for + aria-describedby) con piu' istanze in pagina.
let uniqueId = 0;

/**
 * Editor di una lista ordinata di stringhe (chips add/remove). Dumb e riusabile:
 * il parent possiede la lista (`values`) e riceve la nuova lista via `valuesChange`.
 * La logica UX di inserimento (trim, blocco vuoti/duplicati) vive qui; la
 * generazione varianti resta fuori (step/mapper).
 */
@Component({
  selector: 'app-option-list-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './option-list-editor.component.html',
  styleUrl: './option-list-editor.component.scss',
})
export class OptionListEditorComponent {
  readonly label = input.required<string>();
  readonly values = input.required<readonly string[]>();
  readonly placeholder = input<string>('');
  readonly valuesChange = output<readonly string[]>();

  protected readonly inputId = `option-list-editor-${uniqueId++}`;
  protected readonly errorId = `${this.inputId}-error`;

  protected readonly draftValue = signal('');
  protected readonly errorMessage = signal<string | null>(null);

  protected onInput(value: string): void {
    this.draftValue.set(value);
    if (this.errorMessage()) {
      this.errorMessage.set(null);
    }
  }

  protected add(): void {
    const value = this.draftValue().trim();
    if (!value) {
      this.errorMessage.set('Inserisci un valore.');
      return;
    }
    if (this.isDuplicate(value)) {
      this.errorMessage.set('Valore gia\u0027 presente.');
      return;
    }
    this.valuesChange.emit([...this.values(), value]);
    this.draftValue.set('');
    this.errorMessage.set(null);
  }

  protected remove(value: string): void {
    this.valuesChange.emit(this.values().filter((item) => item !== value));
  }

  /** Duplicati case-insensitive; la casing digitata viene comunque preservata. */
  private isDuplicate(value: string): boolean {
    const normalized = value.toLowerCase();
    return this.values().some((item) => item.toLowerCase() === normalized);
  }
}
