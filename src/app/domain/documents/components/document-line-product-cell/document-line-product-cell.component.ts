import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { caretAtEdge } from '@domain/documents/utils/caret-edge.util';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { formatMoney } from '@core/utils/money.util';

import { DocumentLineSuggestionsComponent } from '../document-line-suggestions/document-line-suggestions.component';
import type { DocumentLineSuggestionItem } from '../document-line-suggestions/document-line-suggestions.model';
import { FirstClickSelectsDirective } from '@shared/directives/first-click-selects.directive';

@Component({
  selector: 'app-document-line-product-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FirstClickSelectsDirective, FormsModule, DocumentLineSuggestionsComponent],
  templateUrl: './document-line-product-cell.component.html',
  styleUrl: './document-line-product-cell.component.scss',
})
export class DocumentLineProductCellComponent {
  // Il permesso sul catalogo non si controlla più qui: i due pulsanti che
  // aprivano l'anagrafica sono passati al pannello di ricerca (11/08/2026), e
  // il controllo li ha seguiti — `document-product-search-panel`. Un gate su
  // una superficie che non esiste più non protegge niente e fa credere il
  // contrario a chi legge.

  readonly lineIndex = input.required<number>();
  readonly inputId = input('');
  readonly value = input.required<string>();
  /**
   * C'è un articolo di catalogo dietro la riga. **Non** cambia la modificabilità
   * del nome — quella non dipende più da qui (11/08/2026) — decide solo se
   * esiste un'anagrafica da aprire e se i suggerimenti devono tacere.
   */
  readonly linked = input(false);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly suggestions = input<readonly VariantSummary[]>([]);
  readonly suggestionsOpen = input(false);
  readonly activeSuggestionIndex = input(0);

  readonly valueChange = output<string>();
  readonly focused = output<number>();
  readonly blurred = output<number>();
  readonly searchOpen = output<number>();
  readonly suggestionPick = output<{ readonly lineIndex: number; readonly variantId: string }>();
  readonly suggestionNavigate = output<'next' | 'prev'>();
  readonly lineAdvance = output<number>();
  /** Shift+Tab: torna al campo dati precedente (gestito dal form padre). */
  readonly lineRetreat = output<number>();
  readonly lineRowAdvance = output<number>();
  readonly lineRowRetreat = output<number>();
  readonly escapePressed = output<number>();

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

  /**
   * Testo già pronto per il pannello condiviso, che non sa cosa sta elencando:
   * compone qui titolo e dettaglio e tiene per sé l'identità della variante.
   */
  protected readonly suggestionItems = computed<readonly DocumentLineSuggestionItem[]>(() =>
    this.suggestions().map((variant) => ({
      title: variant.title,
      detail: this.suggestionDetail(variant),
    })),
  );

  private pickSuggestion(variantId: string): void {
    this.suggestionPick.emit({ lineIndex: this.lineIndex(), variantId });
  }

  /** Il pannello restituisce l'indice: l'id lo risolve chi possiede la lista. */
  protected pickAt(index: number): void {
    const variant = this.suggestions()[index];
    if (variant) {
      this.pickSuggestion(variant.variantId);
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
      this.suggestionNavigate.emit('next');
      return;
    }
    if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      this.suggestionNavigate.emit('prev');
      return;
    }
    // ←/→ a due tempi (§4.2): finché il cursore ha strada dentro il nome la
    // freccia resta al browser; al bordo porta al campo accanto.
    if (event.key === 'ArrowRight' && !event.shiftKey && caretAtEdge(event.target, 'end')) {
      event.preventDefault();
      this.lineAdvance.emit(this.lineIndex());
      return;
    }
    if (event.key === 'ArrowLeft' && !event.shiftKey && caretAtEdge(event.target, 'start')) {
      event.preventDefault();
      this.lineRetreat.emit(this.lineIndex());
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
    if (event.key === 'Tab') {
      // Tab va SEMPRE al campo dati successivo/precedente: mai sui pulsanti
      // icona della cella (lente, «Completa anagrafica»…) — velocità inserimento.
      event.preventDefault();
      if (event.shiftKey) {
        this.lineRetreat.emit(this.lineIndex());
        return;
      }
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
}
