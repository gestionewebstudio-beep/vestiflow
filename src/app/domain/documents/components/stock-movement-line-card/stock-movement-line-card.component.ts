import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';

import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import type {
  LineCodeChoice,
  LineCodeField,
} from '@domain/documents/models/document-line-code-choice.model';

import { DocumentLineProductCellComponent } from '../document-line-product-cell/document-line-product-cell.component';
import { DocumentLineSuggestionsComponent } from '../document-line-suggestions/document-line-suggestions.component';

import { DocumentLineCardComponent } from '../document-line-card/document-line-card.component';
import { DocumentLineCardControlComponent } from '../document-line-card/document-line-card-control.component';
import { DocumentLineCardFieldComponent } from '../document-line-card/document-line-card-field.component';
import { DocumentLineCardGroupComponent } from '../document-line-card/document-line-card-group.component';
import type { DocumentLineCardMeta } from '../document-line-card/document-line-card.model';

/** I controlli della riga di un movimento: cosa e quanto, nient'altro. */
export interface StockMovementLineCardControls {
  readonly variantId: FormControl<string>;
  readonly articleCode: FormControl<string>;
  readonly sku: FormControl<string>;
  readonly barcode: FormControl<string>;
  readonly description: FormControl<string>;
  readonly quantity: FormControl<number>;
  readonly serialNumbersText: FormControl<string>;
}

export interface StockMovementLineCardGroup {
  readonly controls: StockMovementLineCardControls;
}

/**
 * La riga di un **movimento di magazzino** dentro la card condivisa: la usano
 * il Trasferimento e la Rettifica inventario.
 *
 * **Una sola, e non è una scorciatoia.** I due documenti hanno la stessa riga
 * campo per campo — codici, nome, quantità, seriali — e farne due componenti
 * gemelli sarebbe creare oggi la divergenza che altrove stiamo togliendo.
 * Quando i due documenti divergeranno davvero, si separeranno allora.
 *
 * **Quello che questa riga NON ha è il suo dominio**, non una mancanza: niente
 * prezzo, sconto, IVA, costo, unità di misura, codice fornitore. Un movimento
 * sposta o corregge una giacenza, non vende e non compra.
 *
 * **E quello che i due documenti hanno di proprio non sta sulla riga**: il
 * Trasferimento tiene origine e destinazione in testata, la Rettifica tiene il
 * motivo nella banda finale. La riga dice *cosa* e *quanto*; il documento dice
 * *dove* e *perché*.
 */
@Component({
  selector: 'app-stock-movement-line-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DocumentLineCardComponent,
    DocumentLineCardControlComponent,
    DocumentLineCardFieldComponent,
    DocumentLineCardGroupComponent,
    DocumentLineProductCellComponent,
    DocumentLineSuggestionsComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './stock-movement-line-card.component.html',
  styleUrl: './stock-movement-line-card.component.scss',
})
export class StockMovementLineCardComponent {
  readonly lineIndex = input.required<number>();
  readonly line = input.required<StockMovementLineCardGroup>();
  /** I suggerimenti sotto il campo nome: la maschera li cerca al catalogo. */
  readonly suggestions = input<readonly VariantSummary[]>([]);
  readonly suggestionsOpen = input(false);
  /** La scelta aperta da un codice; `null` quando non c'è niente da scegliere. */
  readonly codeChoice = input<LineCodeChoice | null>(null);
  readonly variantInvalid = input(false);
  /** Prefisso degli id dei campi: le due maschere convivono, gli id no. */
  readonly idPrefix = input('mov');
  readonly disabled = input(false);
  readonly canRemove = input(true);

  readonly nameInput = output<string>();
  readonly nameFocus = output<number>();
  readonly nameBlur = output<number>();
  readonly suggestionPick = output<{ readonly lineIndex: number; readonly variantId: string }>();
  readonly searchProduct = output<number>();
  readonly codeFocused = output<LineCodeField>();
  readonly codeBlurred = output<LineCodeField>();
  readonly codeCommitted = output<LineCodeField>();
  readonly codeSuggestionPicked = output<string>();
  readonly removed = output<number>();

  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  /** Il pannello restituisce l'indice: l'id lo risolve chi possiede la lista. */
  protected pickCodeSuggestion(index: number): void {
    const item = this.codeChoice()?.items[index];
    if (item) {
      this.codeSuggestionPicked.emit(item.variantId);
    }
  }

  /**
   * Lo SKU è l'unica cosa che vale la pena leggere a card chiusa: la
   * descrizione è già il titolo, e quantità e seriali stanno nella striscia e
   * nel corpo.
   */
  protected metaItems(): readonly DocumentLineCardMeta[] {
    const sku = this.line().controls.sku.value.trim();
    return sku ? [{ text: `SKU ${sku}` }] : [];
  }
}
