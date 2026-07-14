import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { formatMoney } from '@core/utils/money.util';

@Component({
  selector: 'app-goods-receipt-line-product-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './goods-receipt-line-product-cell.component.html',
  styleUrl: './goods-receipt-line-product-cell.component.scss',
})
export class GoodsReceiptLineProductCellComponent {
  readonly lineIndex = input.required<number>();
  readonly inputId = input('');
  readonly value = input.required<string>();
  readonly linked = input(false);
  readonly linkedLabel = input('');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly suggestions = input<readonly VariantSummary[]>([]);
  readonly suggestionsOpen = input(false);
  readonly activeSuggestionIndex = input(0);
  /** True quando la riga è in modalità "Crea nuovo articolo" esplicita (§8). */
  readonly createMode = input(false);
  /** Toggle "Gestito a magazzino" del nuovo articolo (punto B, default sì). */
  readonly manageStock = input(true);

  readonly valueChange = output<string>();
  readonly manageStockChange = output<boolean>();
  readonly focused = output<number>();
  readonly blurred = output<number>();
  readonly searchOpen = output<number>();
  readonly anagraphicOpen = output<number>();
  readonly detailOpen = output<number>();
  readonly suggestionPick = output<{ readonly lineIndex: number; readonly variantId: string }>();
  readonly suggestionNavigate = output<'next' | 'prev'>();
  readonly lineAdvance = output<number>();
  readonly lineRowAdvance = output<number>();
  readonly lineRowRetreat = output<number>();
  readonly createNewRequest = output<number>();
  readonly createNewCancel = output<number>();
  readonly escapePressed = output<number>();

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('productInput');

  protected readonly listboxId = signal(
    `gr-product-list-${Math.random().toString(36).slice(2, 9)}`,
  );

  protected onInput(value: string): void {
    this.valueChange.emit(value);
  }

  protected onFocus(): void {
    this.focused.emit(this.lineIndex());
  }

  protected onBlur(): void {
    this.blurred.emit(this.lineIndex());
  }

  protected openSearch(event: Event): void {
    event.stopPropagation();
    this.searchOpen.emit(this.lineIndex());
  }

  protected openAnagraphic(event: Event): void {
    event.stopPropagation();
    this.anagraphicOpen.emit(this.lineIndex());
  }

  protected openDetail(event: Event): void {
    event.stopPropagation();
    this.detailOpen.emit(this.lineIndex());
  }

  protected pickSuggestion(variantId: string): void {
    this.suggestionPick.emit({ lineIndex: this.lineIndex(), variantId });
  }

  protected onSuggestionKeydown(event: KeyboardEvent, variantId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.pickSuggestion(variantId);
    }
  }

  protected requestCreateNew(event: Event): void {
    event.stopPropagation();
    this.createNewRequest.emit(this.lineIndex());
  }

  protected cancelCreateNew(event: Event): void {
    event.stopPropagation();
    this.createNewCancel.emit(this.lineIndex());
  }

  protected onManageStockToggle(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.manageStockChange.emit(target.checked);
  }

  /** Etichetta azione "Crea «testo»" nel dropdown (punto D). */
  protected createActionLabel(): string {
    const term = this.value().trim();
    return term ? `Crea «${term}»` : 'Crea nuovo articolo';
  }

  protected onKeydown(event: KeyboardEvent): void {
    const suggestions = this.suggestions();
    const open = this.suggestionsOpen() && suggestions.length > 0;
    const active = this.activeSuggestionIndex();

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.escapePressed.emit(this.lineIndex());
      return;
    }
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      this.lineRowAdvance.emit(this.lineIndex());
      return;
    }
    if (event.key === 'ArrowUp' && !open) {
      event.preventDefault();
      this.lineRowRetreat.emit(this.lineIndex());
      return;
    }
    if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      this.suggestionNavigate.emit('next');
      return;
    }
    if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      this.suggestionNavigate.emit('prev');
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && suggestions[active]) {
        this.pickSuggestion(suggestions[active].variantId);
        return;
      }
      this.lineAdvance.emit(this.lineIndex());
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey && !open) {
      this.lineAdvance.emit(this.lineIndex());
    }
  }

  protected suggestionDetail(variant: VariantSummary): string {
    const parts: string[] = [];
    if (variant.sku) {
      parts.push(variant.sku);
    }
    if (variant.barcode) {
      parts.push(`EAN ${variant.barcode}`);
    }
    if (variant.category) {
      parts.push(variant.category);
    }
    if (variant.stockOnHand != null) {
      parts.push(`Disp. ${variant.stockOnHand}`);
    }
    if (variant.sellingPrice.amountMinor > 0) {
      parts.push(formatMoney(variant.sellingPrice));
    }
    if (variant.purchasePrice && variant.purchasePrice.amountMinor > 0) {
      parts.push(`Acq. ${formatMoney(variant.purchasePrice)}`);
    }
    return parts.join(' · ');
  }

  focusInput(): void {
    this.inputRef()?.nativeElement.focus();
  }
}
