import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';

import { DocumentLineCardComponent } from '@domain/documents/components/document-line-card/document-line-card.component';
import { DocumentLineCardControlComponent } from '@domain/documents/components/document-line-card/document-line-card-control.component';
import { DocumentLineCardFieldComponent } from '@domain/documents/components/document-line-card/document-line-card-field.component';
import { DocumentLineCardGroupComponent } from '@domain/documents/components/document-line-card/document-line-card-group.component';
import type { DocumentLineCardMeta } from '@domain/documents/components/document-line-card/document-line-card.model';
import { DocumentLineSelectCellComponent } from '@domain/documents/components/document-line-select-cell/document-line-select-cell.component';
import { DocumentLineUnitCellComponent } from '@domain/documents/components/document-line-unit-cell/document-line-unit-cell.component';
import { DocumentLineSuggestionsComponent } from '@domain/documents/components/document-line-suggestions/document-line-suggestions.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import type { DocumentLineSuggestionItem } from '@domain/documents/components/document-line-suggestions/document-line-suggestions.model';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

/**
 * Controlli della riga Arrivo merce usati dalla card mobile (§10.10).
 * Tipo strutturale: il FormGroup riga del padre (che ha più controlli) è
 * assegnabile per width subtyping; la card lega i singoli FormControl.
 */
export interface GoodsReceiptLineCardControls {
  readonly productName: FormControl<string>;
  readonly sku: FormControl<string>;
  readonly barcode: FormControl<string>;
  readonly quantity: FormControl<number>;
  readonly unitCost: FormControl<string>;
  readonly discountPercent: FormControl<string>;
  readonly sellingPrice: FormControl<string>;
  readonly compareAtPrice: FormControl<string>;
  readonly loadsStock: FormControl<boolean>;
}

export interface GoodsReceiptLineCardGroup {
  readonly controls: GoodsReceiptLineCardControls;
}

/**
 * Il **contenuto** della riga Arrivo merce dentro la card condivisa.
 *
 * La forma è di `app-document-line-card`; qui resta ciò che un documento
 * d'acquisto ha da dire: il costo nella modalità netto/ivato della testata, il
 * prezzo al pubblico e quello barrato, e il flag «carica magazzino», che decide
 * se questa riga muove giacenza.
 *
 * **Due cose sono cambiate adottando la forma**, e sono allineamenti non
 * perdite: il nome prodotto si modifica nel corpo — nella testata è il titolo,
 * come in ogni altro documento — e l'interruttore «Dettagli economici» non
 * serve più, perché ad aprire la card pensa il chevron della testata.
 *
 * Dumb component: edita il FormGroup ricevuto e delega al padre ricerca
 * articolo, IVA, unità di misura, duplicazione ed eliminazione.
 */
@Component({
  selector: 'app-goods-receipt-line-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DocumentLineCardComponent,
    DocumentLineCardControlComponent,
    DocumentLineCardFieldComponent,
    DocumentLineCardGroupComponent,
    DocumentLineSelectCellComponent,
    DocumentLineSuggestionsComponent,
    DocumentLineUnitCellComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './goods-receipt-line-card.component.html',
  styleUrl: './goods-receipt-line-card.component.scss',
})
export class GoodsReceiptLineCardComponent {
  readonly lineIndex = input.required<number>();
  readonly line = input.required<GoodsReceiptLineCardGroup>();
  readonly linked = input(false);
  readonly productLabel = input('');
  readonly incomplete = input(false);
  /** Etichetta del campo costo secondo la modalità documento (netto/ivato). */
  readonly costLabel = input('Costo');
  readonly totalLabel = input('');
  readonly grossLabel = input<string | null>(null);
  readonly vatOptions = input<readonly SelectMenuOption[]>([]);
  readonly vatValue = input('');
  readonly unitOfMeasure = input('');
  /** Le unità del tenant: le carica la maschera, una volta per documento. */
  readonly unitOfMeasureOptions = input<readonly SelectMenuOption[]>([]);
  readonly disabled = input(false);
  readonly canRemove = input(true);
  /** Suggerimenti ricerca contestuale (§7): stessa sorgente della tabella. */
  readonly suggestions = input<readonly VariantSummary[]>([]);
  readonly suggestionsOpen = input(false);

  readonly searchProduct = output<number>();
  readonly vatChange = output<string | null>();
  readonly unitOfMeasureChanged = output<string>();
  readonly unitManagerRequested = output<void>();
  readonly fieldBlur = output<number>();
  readonly duplicated = output<number>();
  readonly removed = output<number>();
  readonly nameInput = output<string>();
  readonly nameFocus = output<number>();
  readonly nameBlur = output<number>();
  readonly suggestionPick = output<{ readonly lineIndex: number; readonly variantId: string }>();

  protected readonly detailsOpen = signal(false);

  /** Le varianti nel formato del pannello condiviso: il testo, non l'id. */
  protected readonly suggestionItems = computed<readonly DocumentLineSuggestionItem[]>(() =>
    this.suggestions().map((variant) => ({
      title: variant.title,
      detail: this.suggestionDetail(variant) || undefined,
    })),
  );

  protected toggleDetails(): void {
    this.detailsOpen.update((open) => !open);
  }

  protected onNameInput(value: string): void {
    this.nameInput.emit(value);
  }

  /** Il pannello restituisce l'indice; qui si torna alla variante. */
  protected pickSuggestion(index: number): void {
    const variant = this.suggestions()[index];
    if (variant) {
      this.suggestionPick.emit({ lineIndex: this.lineIndex(), variantId: variant.variantId });
    }
  }

  private suggestionDetail(variant: VariantSummary): string {
    const parts: string[] = [];
    if (variant.sku) {
      parts.push(variant.sku);
    }
    if (variant.stockOnHand != null) {
      parts.push(`Disp. ${variant.stockOnHand}`);
    }
    return parts.join(' · ');
  }

  /**
   * Le informazioni che restano leggibili a card chiusa: qui SKU ed EAN, che
   * sono ciò con cui si riconosce una riga d'acquisto.
   */
  protected metaItems(): readonly DocumentLineCardMeta[] {
    const codice = this.codeLabel();
    return codice ? [{ text: codice }] : [];
  }

  protected codeLabel(): string {
    const sku = this.line().controls.sku.value.trim();
    const barcode = this.line().controls.barcode.value.trim();
    if (sku && barcode) {
      return `${sku} · EAN ${barcode}`;
    }
    return sku || (barcode ? `EAN ${barcode}` : '');
  }
}
