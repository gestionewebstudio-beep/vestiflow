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
  selector: 'app-goods-receipt-line-code-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './goods-receipt-line-code-cell.component.html',
  styleUrl: './goods-receipt-line-code-cell.component.scss',
})
export class GoodsReceiptLineCodeCellComponent {
  readonly lineIndex = input.required<number>();
  readonly inputId = input('');
  readonly ariaLabel = input.required<string>();
  readonly value = input.required<string>();
  readonly linked = input(false);
  readonly linkedValue = input('');
  readonly disabled = input(false);
  readonly suggestions = input<readonly VariantSummary[]>([]);
  readonly suggestionsOpen = input(false);
  readonly activeSuggestionIndex = input(0);

  readonly valueChange = output<string>();
  readonly focused = output<number>();
  readonly blurred = output<number>();
  readonly commit = output<number>();
  readonly lineRowAdvance = output<number>();
  readonly lineRowRetreat = output<number>();
  readonly suggestionPick = output<{ readonly lineIndex: number; readonly variantId: string }>();
  readonly escapePressed = output<number>();

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  protected readonly listboxId = signal(`gr-code-list-${Math.random().toString(36).slice(2, 9)}`);

  protected onInput(value: string): void {
    this.valueChange.emit(value);
  }

  protected onFocus(): void {
    this.focused.emit(this.lineIndex());
  }

  protected onBlur(): void {
    this.blurred.emit(this.lineIndex());
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
      return;
    }
    if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && suggestions[active]) {
        this.pickSuggestion(suggestions[active].variantId);
        return;
      }
      this.commit.emit(this.lineIndex());
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      this.commit.emit(this.lineIndex());
    }
  }

  protected suggestionDetail(variant: VariantSummary): string {
    const parts: string[] = [variant.productName];
    if (variant.barcode) {
      parts.push(`EAN ${variant.barcode}`);
    }
    if (variant.purchasePrice && variant.purchasePrice.amountMinor > 0) {
      parts.push(formatMoney(variant.purchasePrice));
    }
    return parts.join(' · ');
  }

  focusInput(): void {
    this.inputRef()?.nativeElement.focus();
  }
}
