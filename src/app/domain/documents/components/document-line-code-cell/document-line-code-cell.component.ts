import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { classifyLineCellKey } from '@domain/documents/utils/document-line-cell-keys.util';

import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import { DocumentLineSuggestionsComponent } from '../document-line-suggestions/document-line-suggestions.component';
import type { DocumentLineSuggestionItem } from '../document-line-suggestions/document-line-suggestions.model';
import { voceSuggerimento } from '../document-line-suggestions/voce-suggerimento.util';
import { FirstClickSelectsDirective } from '@shared/directives/first-click-selects.directive';

/** Conferma di un codice, col gesto che l'ha prodotta. */
export interface DocumentLineCodeCommit {
  readonly lineIndex: number;
  /**
   * `true` col Tab: dopo aver confrontato il codice, il fuoco prosegue.
   * `false` con Invio: si conferma e si resta.
   *
   * ⚠️ Con una corrispondenza sola il fuoco si sposta **comunque**, e non è una
   * disobbedienza alla regola: agganciando l'articolo la cella smette di essere
   * un campo e diventa testo, quindi «restare» non è possibile — non c'è più
   * niente su cui restare.
   */
  readonly advance: boolean;
}

@Component({
  selector: 'app-document-line-code-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FirstClickSelectsDirective, FormsModule, DocumentLineSuggestionsComponent],
  templateUrl: './document-line-code-cell.component.html',
  styleUrl: './document-line-code-cell.component.scss',
})
export class DocumentLineCodeCellComponent {
  readonly lineIndex = input.required<number>();
  readonly inputId = input('');
  readonly ariaLabel = input.required<string>();
  /** Placeholder mostrato a cella vuota (es. «Cerca SKU», «Scansiona EAN»). */
  readonly placeholder = input('');
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
  /**
   * Il valore è confermato: si confronta col catalogo.
   *
   * Porta con sé **la conseguenza del gesto**, che solo la cella conosce: Tab
   * conferma **e va avanti**, Invio conferma **e resta** (specifica §4.5). Prima
   * i due tasti emettevano lo stesso esito e il form non poteva distinguerli,
   * quindi Invio navigava — nella stessa riga faceva una cosa diversa a seconda
   * della colonna, perché sui campi dati resta.
   */
  readonly commit = output<DocumentLineCodeCommit>();
  /** Shift+Tab: torna al campo dati precedente (gestito dal form padre). */
  readonly lineRetreat = output<number>();
  readonly lineRowAdvance = output<number>();
  readonly lineRowRetreat = output<number>();
  readonly suggestionPick = output<{ readonly lineIndex: number; readonly variantId: string }>();
  /**
   * Frecce a pannello aperto: scorrono la scelta, non le righe del documento.
   * Il pannello di questa cella non è un elenco di risultati — il campo codice
   * non cerca (§codici) — è la scelta fra più corrispondenze ESATTE: quale
   * variante dello stesso articolo, o quale articolo per lo stesso codice
   * fornitore. Una scelta si naviga da tastiera, altrimenti si può solo
   * prendere la prima o staccare la mano per il mouse.
   */
  readonly suggestionNavigate = output<'next' | 'prev'>();
  readonly escapePressed = output<number>();

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

  /**
   * Testo già pronto per il pannello condiviso, che non sa cosa sta elencando:
   * compone qui titolo e dettaglio e tiene per sé l'identità della variante.
   */
  protected readonly suggestionItems = computed<readonly DocumentLineSuggestionItem[]>(() =>
    // ⭐ Il costo si mostra QUI e non nella cella «Nome prodotto»: questa serve
    //    ai documenti di acquisto, dove il costo è il numero che si guarda.
    this.suggestions().map((variant) => voceSuggerimento(variant, { conCosto: true })),
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
        // L'unico che ferma anche la risalita: Esc dentro la cella non deve
        // arrivare a chi chiuderebbe l'intera maschera.
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
        // Qui sta la differenza vera con la cella nome: il codice si REGISTRA,
        // e `advance` dice se dopo ci si sposta (Tab, →) o si resta (Invio, §4.5).
        this.commit.emit({ lineIndex: this.lineIndex(), advance: esito.advance });
        return;
    }
  }
}
