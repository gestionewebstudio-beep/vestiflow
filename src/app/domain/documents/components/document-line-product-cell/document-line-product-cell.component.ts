import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { classifyLineCellKey } from '@domain/documents/utils/document-line-cell-keys.util';

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
    const esito = classifyLineCellKey(event, {
      suggestionsOpen: this.suggestionsOpen() && suggestions.length > 0,
      activeSuggestionIndex: this.activeSuggestionIndex(),
    });
    if (!esito) {
      return;
    }
    event.preventDefault();
    switch (esito.kind) {
      case 'escape':
        event.stopPropagation();
        this.escapePressed.emit(this.lineIndex());
        return;
      case 'row-advance':
        this.lineRowAdvance.emit(this.lineIndex());
        return;
      case 'row-retreat':
        this.lineRowRetreat.emit(this.lineIndex());
        return;
      case 'suggestion-move':
        this.suggestionNavigate.emit(esito.direction);
        return;
      case 'suggestion-pick': {
        const variant = suggestions[esito.index];
        if (variant) {
          this.pickSuggestion(variant.variantId);
        }
        return;
      }
      case 'field-retreat':
        this.lineRetreat.emit(this.lineIndex());
        return;
      case 'confirm':
        // ⚠️ Qui il nome NON registra niente — non c'è un codice da confrontare
        // col catalogo — quindi `advance` non cambia l'esito: si va al campo
        // dopo in entrambi i casi. Vuol dire che su questa cella **Invio
        // avanza**, mentre sulla cella codice resta (§4.5). È una divergenza
        // vera fra le due, non un residuo dell'estrazione: la funzione
        // condivisa la rende visibile invece di tenerla sepolta in sessanta
        // righe uguali. Da decidere, non da correggere di nascosto.
        this.lineAdvance.emit(this.lineIndex());
        return;
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
