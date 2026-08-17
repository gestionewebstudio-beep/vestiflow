import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';

import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import type { LineCodeChoice, LineCodeField } from '../../models/document-line-code-choice.model';
import { DocumentLineProductCellComponent } from '../document-line-product-cell/document-line-product-cell.component';
import { DocumentLineSelectCellComponent } from '../document-line-select-cell/document-line-select-cell.component';
import { DocumentLineSuggestionsComponent } from '../document-line-suggestions/document-line-suggestions.component';

import { DocumentLineCardComponent } from '../document-line-card/document-line-card.component';
import { DocumentLineCardControlComponent } from '../document-line-card/document-line-card-control.component';
import { DocumentLineCardFieldComponent } from '../document-line-card/document-line-card-field.component';
import { DocumentLineCardGroupComponent } from '../document-line-card/document-line-card-group.component';
import type { DocumentLineCardMeta } from '../document-line-card/document-line-card.model';

/** I controlli della riga di un documento di vendita. */
export interface SalesDocumentLineCardControls {
  readonly variantId: FormControl<string>;
  readonly articleCode: FormControl<string>;
  readonly sku: FormControl<string>;
  readonly barcode: FormControl<string>;
  readonly description: FormControl<string>;
  readonly quantity: FormControl<number>;
  readonly unitPrice: FormControl<string>;
  readonly discountPercent: FormControl<string>;
  readonly vatCodeId: FormControl<string>;
  readonly loadsStock: FormControl<boolean>;
  /** Riga descrittiva di riferimento (`07` §12): niente quantità sulla card. */
  readonly isReference: FormControl<boolean>;
}

export interface SalesDocumentLineCardGroup {
  readonly controls: SalesDocumentLineCardControls;
}

/**
 * La riga di un **documento di vendita** dentro la card condivisa: Proforma,
 * Fattura e Fattura accompagnatoria.
 *
 * **Mostra quello che il documento ha oggi.** Niente selettore di sottotipo:
 * i comportamenti della famiglia fattura — acconto, nota di credito — non sono
 * ancora decisi, e una card che li anticipasse prometterebbe una scelta che il
 * resto del sistema non sa ancora onorare.
 *
 * **Quello che questa riga non ha è il suo dominio**, non una mancanza: niente
 * seriali (una fattura non li tiene), niente unità di misura, niente costo
 * d'acquisto. E «Scarica mag.» compare solo dove esiste davvero — Fattura
 * accompagnatoria senza DDT agganciato —, deciso dalla maschera e non da qui.
 */
@Component({
  selector: 'app-sales-document-line-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DocumentLineCardComponent,
    DocumentLineCardControlComponent,
    DocumentLineCardFieldComponent,
    DocumentLineCardGroupComponent,
    DocumentLineProductCellComponent,
    DocumentLineSelectCellComponent,
    DocumentLineSuggestionsComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './sales-document-line-card.component.html',
  styleUrl: './sales-document-line-card.component.scss',
})
export class SalesDocumentLineCardComponent {
  readonly lineIndex = input.required<number>();
  readonly line = input.required<SalesDocumentLineCardGroup>();

  /** I suggerimenti sotto il campo nome: la maschera li cerca al catalogo. */
  readonly suggestions = input<readonly VariantSummary[]>([]);
  readonly suggestionsOpen = input(false);
  /** La scelta aperta da un codice; `null` quando non c'è niente da scegliere. */
  readonly codeChoice = input<LineCodeChoice | null>(null);

  /** Codici IVA della riga, già filtrati dalla maschera. */
  readonly vatOptions = input<readonly SelectMenuOption[]>([]);
  /** «Prezzo» o «Prezzo ivato», secondo la modalità del documento. */
  readonly priceLabel = input('Prezzo');
  /** Totale di riga già formattato: la card non fa conti in valuta. */
  readonly totalLabel = input('');
  readonly showLoadsStock = input(false);
  readonly loadsStockLabel = input('Scarica mag.');

  readonly nameInvalid = input(false);
  readonly idPrefix = input('sd');
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
  readonly vatSelected = output<string>();
  readonly duplicated = output<number>();
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
   * A card chiusa si legge lo SKU: il nome è già il titolo, e quantità, prezzo
   * e totale stanno nella striscia.
   */
  protected metaItems(): readonly DocumentLineCardMeta[] {
    const sku = this.line().controls.sku.value.trim();
    return sku ? [{ text: `SKU ${sku}` }] : [];
  }
}
