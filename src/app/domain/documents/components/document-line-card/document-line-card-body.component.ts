import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { DocumentLineCodeCellComponent } from '../document-line-code-cell/document-line-code-cell.component';
import { DocumentLineProductCellComponent } from '../document-line-product-cell/document-line-product-cell.component';
import { DocumentLineSelectCellComponent } from '../document-line-select-cell/document-line-select-cell.component';
import { DocumentLineUnitCellComponent } from '../document-line-unit-cell/document-line-unit-cell.component';
import {
  DOCUMENT_LINE_CARD_GROUPS,
  DOCUMENT_LINE_CARD_GROUP_OF,
  DOCUMENT_LINE_ROW_VIEW_VUOTA,
  stripPriceColumn,
} from '../document-line-row/document-line-row.model';
import type {
  DocumentLineCardGroup,
  DocumentLineCodeField,
  DocumentLineColumnId,
  DocumentLineFieldEvent,
  DocumentLineRowView,
  DocumentLineSuggestionPick,
} from '../document-line-row/document-line-row.model';

import { DocumentLineCardFieldComponent } from './document-line-card-field.component';
import { DocumentLineCardGroupComponent } from './document-line-card-group.component';

/**
 * **Il corpo apribile della card, guidato dal CATALOGO COLONNE** — il gemello
 * mobile di `document-line-row`.
 *
 * ## Il difetto che chiude
 *
 * La forma della card era già una sola per tutti i documenti
 * (`document-line-card`), ma **il contenuto lo scriveva ogni maschera**: sei
 * involucri locali, uno per feature, che sono al mobile quello che le `<td>`
 * scritte a mano erano al desktop. Misurato il 24/08/2026, con quattordici
 * divergenze — e cinque colpivano cinque o sei maschere su sei, cioè non erano
 * peculiarità: era il riferimento mai applicato.
 *
 * ## Le tre conseguenze di essere guidato dal catalogo
 *
 * 1. ⭐ **Il selettore Colonne raggiunge il mobile.** Prima `isColumnVisible`
 *    arrivava solo alla tabella: si spegneva una colonna sul telefono e nella
 *    card non cambiava niente. Cod. articolo, SKU ed EAN mancavano da tre card
 *    pur essendo colonne visibili di default sul desktop delle stesse maschere.
 * 2. ⭐ **I gruppi si deducono.** Un gruppo compare se il documento ha almeno
 *    una colonna visibile che gli appartiene — «Magazzino» vale anche con un
 *    campo solo, e non si rende se il documento non movimenta niente.
 * 3. ⭐ **Nessun campo compare due volte.** Quello che sta nella striscia non
 *    torna nel corpo: la card di riferimento ripeteva prezzo e totale, cioè due
 *    `<input>` sullo stesso controllo con due identificativi, nella stessa card.
 *
 * ## Cosa NON decide
 *
 * Non sa che documento sta mostrando, e non deve: le differenze arrivano come
 * dati — quali colonne, quale etichetta per la spunta magazzino — o come
 * domanda al gruppo di controlli (`haControllo`). Nessun `if (documentType)`.
 */
@Component({
  selector: 'app-document-line-card-body',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DocumentLineCardFieldComponent,
    DocumentLineCardGroupComponent,
    DocumentLineCodeCellComponent,
    DocumentLineProductCellComponent,
    DocumentLineSelectCellComponent,
    DocumentLineUnitCellComponent,
  ],
  templateUrl: './document-line-card-body.component.html',
})
export class DocumentLineCardBodyComponent {
  readonly group = input.required<FormGroup>();
  readonly lineIndex = input.required<number>();
  readonly isColumnVisible = input.required<(column: DocumentLineColumnId) => boolean>();
  readonly idPrefix = input('doc');
  readonly view = input<DocumentLineRowView>(DOCUMENT_LINE_ROW_VIEW_VUOTA);
  readonly readOnly = input(false);
  readonly unitOptions = input<readonly SelectMenuOption[]>([]);

  /** «Impegna» su un ordine, «Scarica» su un DDT: parole del documento. */
  readonly stockToggleLabel = input('Impegna magazzino');
  readonly loadToggleLabel = input('Carica magazzino');
  readonly priceLabel = input('Prezzo');
  readonly costLabel = input('Costo');

  readonly codeChanged = output<DocumentLineFieldEvent<string>>();
  readonly codeFocused = output<DocumentLineCodeField>();
  readonly codeBlurred = output<DocumentLineCodeField>();
  readonly codeCommitted = output<DocumentLineCodeField>();

  readonly productNameChanged = output<string>();
  readonly productFocused = output<void>();
  readonly productBlurred = output<void>();
  readonly productSearchOpened = output<void>();

  readonly suggestionPicked = output<DocumentLineSuggestionPick>();

  readonly unitChanged = output<string>();
  readonly unitManageRequested = output<void>();
  readonly vatSelected = output<string | null>();
  readonly costChanged = output<string>();
  readonly stockToggled = output<{ column: DocumentLineColumnId; value: boolean }>();

  /**
   * Le colonne che NON entrano nel corpo, calcolate da cosa è visibile.
   *
   * `quantity`, `lineTotal` e il prezzo stanno nella striscia; `variantLabel`
   * nella testata; `actions` è il cestino, che la card ha già.
   */
  private readonly fuoriDalCorpo = computed<ReadonlySet<DocumentLineColumnId>>(() => {
    const prezzo = stripPriceColumn(this.isColumnVisible());
    const fuori = new Set<DocumentLineColumnId>(['quantity', 'lineTotal', 'variantLabel', 'actions']);
    if (prezzo) {
      fuori.add(prezzo);
    }
    return fuori;
  });

  /** Vero se la colonna va rese nel corpo: dichiarata, accesa, e non in striscia. */
  protected mostra(column: DocumentLineColumnId): boolean {
    return !this.fuoriDalCorpo().has(column) && this.isColumnVisible()(column);
  }

  /**
   * I gruppi da rendere, nell'ordine, con l'indicazione di chi è il primo — che
   * non porta il filo sopra perché non separa da niente.
   */
  protected readonly gruppi = computed<
    readonly { readonly id: DocumentLineCardGroup; readonly label: string; readonly first: boolean }[]
  >(() => {
    const visibile = this.isColumnVisible();
    const fuori = this.fuoriDalCorpo();
    const pieni = DOCUMENT_LINE_CARD_GROUPS.filter((gruppo) =>
      (Object.keys(DOCUMENT_LINE_CARD_GROUP_OF) as DocumentLineColumnId[]).some(
        (column) =>
          DOCUMENT_LINE_CARD_GROUP_OF[column] === gruppo.id && !fuori.has(column) && visibile(column),
      ),
    );
    return pieni.map((gruppo, indice) => ({ ...gruppo, first: indice === 0 }));
  });

  protected fieldId(field: string): string {
    return `${this.idPrefix()}-m-${field}-${this.lineIndex()}`;
  }

  /**
   * Il documento ha davvero questo controllo?
   *
   * ⭐ È il canale con cui la stessa colonna è editabile in un documento e in
   * sola lettura in un altro, senza un `if (documentType)`: l'Arrivo merce
   * scrive i prezzi d'anagrafica, l'Ordine fornitore li mostra e basta.
   */
  protected haControllo(name: string): boolean {
    return Boolean(this.group().get(name));
  }

  protected controlValue(name: string): string {
    return String(this.group().get(name)?.value ?? '');
  }

  protected onStockToggle(column: DocumentLineColumnId, event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.stockToggled.emit({ column, value: target?.value === 'yes' });
  }
}
