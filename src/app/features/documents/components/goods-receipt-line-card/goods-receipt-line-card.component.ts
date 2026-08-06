import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';

import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
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
 * Card riga prodotto per mobile (§10.10): campi principali subito visibili
 * (articolo, quantità, costo, totale), dettagli economici espandibili.
 * Dumb component: edita il FormGroup ricevuto e delega al padre ricerca
 * articolo, IVA, duplicazione ed eliminazione.
 */
@Component({
  selector: 'app-goods-receipt-line-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DocumentLineSuggestionsComponent, ReactiveFormsModule, SelectMenuComponent],
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
  readonly disabled = input(false);
  readonly canRemove = input(true);
  /** Suggerimenti ricerca contestuale (§7): stessa sorgente della tabella. */
  readonly suggestions = input<readonly VariantSummary[]>([]);
  readonly suggestionsOpen = input(false);

  readonly searchProduct = output<number>();
  readonly vatChange = output<string | null>();
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

  protected codeLabel(): string {
    const sku = this.line().controls.sku.value.trim();
    const barcode = this.line().controls.barcode.value.trim();
    if (sku && barcode) {
      return `${sku} · EAN ${barcode}`;
    }
    return sku || (barcode ? `EAN ${barcode}` : '');
  }
}
