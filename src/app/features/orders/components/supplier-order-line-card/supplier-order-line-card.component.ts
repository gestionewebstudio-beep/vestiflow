import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';

import { DocumentLineCardComponent } from '@domain/documents/components/document-line-card/document-line-card.component';
import { DocumentLineCardControlComponent } from '@domain/documents/components/document-line-card/document-line-card-control.component';
import { DocumentLineCardFieldComponent } from '@domain/documents/components/document-line-card/document-line-card-field.component';
import { DocumentLineCardGroupComponent } from '@domain/documents/components/document-line-card/document-line-card-group.component';
import type { DocumentLineCardMeta } from '@domain/documents/components/document-line-card/document-line-card.model';
import { DocumentLineSelectCellComponent } from '@domain/documents/components/document-line-select-cell/document-line-select-cell.component';
import { DocumentLineSuggestionsComponent } from '@domain/documents/components/document-line-suggestions/document-line-suggestions.component';
import type { DocumentLineSuggestionItem } from '@domain/documents/components/document-line-suggestions/document-line-suggestions.model';
import { DocumentLineUnitCellComponent } from '@domain/documents/components/document-line-unit-cell/document-line-unit-cell.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

/**
 * Controlli della riga Ordine fornitore usati dalla card. Tipo strutturale: il
 * FormGroup della maschera ne ha di più, ed è assegnabile.
 */
export interface SupplierOrderLineCardControls {
  readonly productName: FormControl<string>;
  /** L'etichetta della variante, fotografata: «M / Rosso». Vuota se non ne ha. */
  readonly variantLabel: FormControl<string>;
  readonly sku: FormControl<string>;
  readonly barcode: FormControl<string>;
  readonly supplierCode: FormControl<string>;
  readonly orderedQuantity: FormControl<number>;
  readonly unitCost: FormControl<string>;
  readonly discountPercent: FormControl<string>;
}

export interface SupplierOrderLineCardGroup {
  readonly controls: SupplierOrderLineCardControls;
}

/**
 * Il **contenuto** della riga Ordine fornitore dentro la card condivisa.
 *
 * Da telefono questa maschera non aveva una card: impilava la tabella con un
 * mixin, e sotto lg diventava una tabella schiacciata con le etichette accanto
 * ai valori. Era l'unica delle tre a farlo, e la ragione per cui la vista mobile
 * dell'Ordine fornitore si comportava diversamente da quella degli altri due
 * documenti.
 *
 * Cosa mette dentro la forma condivisa: il **costo** nella modalità netto/ivato
 * della testata, lo **sconto**, il **Codice IVA**, e il **codice fornitore** —
 * quest'ultimo è la sola cosa che non esiste negli altri due documenti, ed è la
 * ragione per cui questo documento chiede il fornitore prima delle righe: senza
 * fornitore, «il codice con cui LUI chiama questo articolo» è una frase senza
 * soggetto.
 *
 * Dumb: edita il FormGroup che riceve, e delega alla maschera la ricerca
 * articolo, l'IVA, l'unità di misura ed eliminazione.
 */
@Component({
  selector: 'app-supplier-order-line-card',
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
  templateUrl: './supplier-order-line-card.component.html',
  styleUrl: './supplier-order-line-card.component.scss',
})
export class SupplierOrderLineCardComponent {
  readonly lineIndex = input.required<number>();
  readonly line = input.required<SupplierOrderLineCardGroup>();
  readonly linked = input(false);
  readonly productLabel = input('');
  readonly incomplete = input(false);
  /** Etichetta del campo costo secondo la modalità documento (netto/ivato). */
  readonly costLabel = input('Costo');
  readonly totalLabel = input('');
  readonly vatOptions = input<readonly SelectMenuOption[]>([]);
  readonly vatValue = input('');
  readonly unitOfMeasure = input('');
  readonly unitOfMeasureOptions = input<readonly SelectMenuOption[]>([]);
  readonly disabled = input(false);
  readonly canRemove = input(true);
  readonly suggestions = input<readonly VariantSummary[]>([]);
  readonly suggestionsOpen = input(false);

  readonly searchProduct = output<number>();
  readonly vatChange = output<string>();
  readonly unitOfMeasureChanged = output<string>();
  readonly unitManagerRequested = output<void>();
  readonly removed = output<number>();
  readonly nameInput = output<string>();
  readonly nameFocus = output<number>();
  readonly nameBlur = output<number>();
  readonly suggestionPick = output<{ readonly lineIndex: number; readonly variantId: string }>();

  protected readonly open = signal(false);

  protected readonly suggestionItems = computed<readonly DocumentLineSuggestionItem[]>(() =>
    this.suggestions().map((variant) => ({
      title: variant.title,
      detail: variant.sku || undefined,
    })),
  );

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  /**
   * Cosa resta leggibile a card chiusa: SKU e — se c'è — il codice con cui il
   * fornitore chiama l'articolo, che su un ordine d'acquisto è l'informazione
   * con cui si controlla la conferma d'ordine.
   */
  /**
   * Le sub-info sotto il nome: la VARIANTE per prima, poi SKU e Cod. fornitore.
   *
   * ⚠️ La variante deve stare qui, e non e' una rifinitura: il titolo della
   * card e' il nome prodotto, che fino a ieri se la portava dentro attraverso
   * il ripiego su `summary.title`. Ora che il nome e' solo il nome, senza
   * questa riga la variante **sparirebbe da mobile** — e in silenzio, perche'
   * tabella e card leggono due campi diversi.
   *
   * Prima dello SKU perche' e' cio' che distingue due righe dello stesso
   * articolo: e' la domanda che si fa scorrendo l'elenco.
   */
  /**
   * Le sub-info sotto il nome: SKU e codice fornitore.
   *
   * ⚠️ **La variante NON sta qui**, e ci è stata per poche ore: la card
   * condivisa ha un input `[variantLabel]` dedicato, che la rende su una riga
   * sua fra il titolo e i meta. Due canali per lo stesso dato lo mostrerebbero
   * in due posti diversi a seconda della maschera — riga dedicata sull'Ordine
   * cliente, voce meta col punto medio qui — e la differenza non la vedrebbe
   * nessun test.
   */
  protected metaItems(): readonly DocumentLineCardMeta[] {
    const meta: DocumentLineCardMeta[] = [];
    const sku = this.line().controls.sku.value.trim();
    const supplierCode = this.line().controls.supplierCode.value.trim();
    if (sku) {
      meta.push({ text: `SKU ${sku}` });
    }
    if (supplierCode) {
      meta.push({ text: `Cod. forn. ${supplierCode}` });
    }
    return meta;
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
}
