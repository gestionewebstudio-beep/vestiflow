import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { DOCUMENT_LINE_ROW_VIEW_VUOTA, stripPriceColumn } from '../document-line-row/document-line-row.model';
import type {
  DocumentLineColumnId,
  DocumentLineRowView,
} from '../document-line-row/document-line-row.model';

import { DocumentLineCardControlComponent } from './document-line-card-control.component';

/**
 * **La striscia sempre visibile della card**: i valori che si modificano senza
 * aprirla.
 *
 * ⭐ Sono quantità, prezzo e totale — ma **quali esistano lo dice il
 * catalogo**, non il documento a mano. Dove si vende il prezzo è `unitPrice`,
 * dove si compra è `unitCost`, e dove non c'è né l'uno né l'altro — un
 * trasferimento, una rettifica — la striscia ne ha semplicemente una in meno.
 *
 * ⛔ **Con una voce sola non si allinea a destra.** La griglia della card è
 * `auto 1fr auto` e l'ultimo figlio prende l'allineamento pensato per il
 * totale: su Rettifica e Trasferimento l'unico controllo — la quantità —
 * finiva a destra da solo, e sembrava un totale. La striscia dichiara quante
 * voci ha e la griglia si adegua.
 */
@Component({
  selector: 'app-document-line-card-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DocumentLineCardControlComponent],
  host: {
    class: 'doc-line-card-strip',
    '[class.doc-line-card-strip--single]': 'voci() === 1',
    '[class.doc-line-card-strip--pair]': 'voci() === 2',
  },
  templateUrl: './document-line-card-strip.component.html',
  styleUrl: './document-line-card-strip.component.scss',
})
export class DocumentLineCardStripComponent {
  readonly group = input.required<FormGroup>();
  readonly lineIndex = input.required<number>();
  readonly isColumnVisible = input.required<(column: DocumentLineColumnId) => boolean>();
  readonly view = input<DocumentLineRowView>(DOCUMENT_LINE_ROW_VIEW_VUOTA);
  readonly readOnly = input(false);

  /** «Prezzo netto», «Prezzo ivato», «Costo»: la parola la dà il documento. */
  readonly priceLabel = input('Prezzo');
  /** Il minimo della quantità: 1 al banco, 0 dove una riga può nascere vuota. */
  readonly quantityMin = input(0);

  /** Il passo dello stepper: la maschera decide cosa vuol dire «uno in più». */
  readonly quantityStepped = output<number>();
  readonly costChanged = output<string>();

  /** Quale colonna occupa il posto del prezzo, o nessuna. */
  protected readonly prezzo = computed<DocumentLineColumnId | null>(() =>
    stripPriceColumn(this.isColumnVisible()),
  );

  protected readonly mostraQuantita = computed(() => this.isColumnVisible()('quantity'));
  protected readonly mostraTotale = computed(() => this.isColumnVisible()('lineTotal'));

  protected readonly voci = computed(
    () =>
      (this.mostraQuantita() ? 1 : 0) + (this.prezzo() ? 1 : 0) + (this.mostraTotale() ? 1 : 0),
  );

  /** Il nome del controllo del prezzo: `unitPrice` o `unitCost`. */
  protected readonly prezzoControl = computed(() => this.prezzo() ?? '');
}
