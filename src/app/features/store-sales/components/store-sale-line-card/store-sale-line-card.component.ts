import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { DocumentLineCardControlComponent } from '@domain/documents/components/document-line-card/document-line-card-control.component';
import { DocumentLineCardFieldComponent } from '@domain/documents/components/document-line-card/document-line-card-field.component';
import { DocumentLineCardGroupComponent } from '@domain/documents/components/document-line-card/document-line-card-group.component';
import { DocumentLineCardComponent } from '@domain/documents/components/document-line-card/document-line-card.component';
import type { DocumentLineCardMeta } from '@domain/documents/components/document-line-card/document-line-card.model';
import type { StoreSaleDocumentLine } from '@domain/store-sales/models/store-sale-document-line.model';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * La riga di Vendita/Reso al banco come **card**, sotto la soglia compatta.
 *
 * ## Da dove viene la forma
 *
 * ⭐ **Il riferimento è il Nuovo Ordine cliente** (`11` A12 e A15): struttura,
 * disposizione, densità e comportamento delle righe su mobile sono i suoi. Ma
 * il riferimento **non è una dipendenza**: qui non si importa niente da
 * `features/sales-orders/` — si usano le primitive comuni già estratte in
 * `domain/documents/components/document-line-card/`, che sono la stessa forma
 * che l'Ordine cliente monta.
 *
 * ⛔ **E non si riprende il mobile della vecchia maschera del banco**, che non
 * esiste: gli `data-label` erano nel markup e nessuna regola li usava, quindi
 * sotto la soglia restava una tabella a sette colonne in scroll orizzontale.
 *
 * ## Perché una terza card e non un input in più
 *
 * `customer-order-line-card` e `goods-receipt-line-card` restano due perché
 * portano campi diversi — impegno magazzino e listini l'una, lotti e seriali
 * l'altra. Questa è la terza, con **quattro imbocchi soli** (`11` C, 19/08):
 *
 * ```text
 * sempre visibili   Q.tà · Prezzo · Totale
 * nel corpo         Articolo (descrizione, SKU) · Vendita (prezzo, sconto, IVA)
 * riga meta         SKU e disponibilità, leggibili a card chiusa
 * ```
 *
 * ⚠️ **La spunta di magazzino sta nel corpo, non fra i valori sempre visibili**:
 * è l'eccezione, non il gesto ripetuto (`11` A15). L'etichetta la porta la
 * maschera — «Scarica giacenze» sulla Vendita, «Carica giacenze» sul Reso — che
 * è l'unico punto in cui i due modi divergono qui dentro.
 *
 * ## Che cosa NON sa
 *
 * ⛔ Niente logiche dell'Ordine cliente: nessun impegno di magazzino, nessuna
 * riga «documento collegato», nessun listino. Il fatto che il mobile ne segua la
 * forma non porta con sé il suo dominio.
 */
@Component({
  selector: 'app-store-sale-line-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DocumentLineCardComponent,
    DocumentLineCardControlComponent,
    DocumentLineCardFieldComponent,
    DocumentLineCardGroupComponent,
    SelectMenuComponent,
  ],
  templateUrl: './store-sale-line-card.component.html',
  styleUrl: './store-sale-line-card.component.scss',
})
export class StoreSaleLineCardComponent {
  readonly line = input.required<StoreSaleDocumentLine>();
  /** Posizione 1-based nella lettura assistita: «Riga 3». */
  readonly lineIndex = input.required<number>();
  readonly open = input(false);

  /** Il valore da mostrare nel campo prezzo, già nella modalità del documento. */
  readonly priceValue = input.required<string>();
  /** «Prezzo netto» o «Prezzo ivato»: la modalità è del documento, non della riga. */
  readonly priceLabel = input.required<string>();
  readonly lineTotal = input.required<string>();
  readonly vatOptions = input.required<readonly SelectMenuOption[]>();
  /** «Scarica giacenze» / «Carica giacenze»: la porta il modo (`11` A15). */
  readonly stockToggleLabel = input.required<string>();
  /** Avviso non bloccante della disponibilità superata; vuoto = nessun avviso. */
  readonly availabilityHint = input('');

  readonly toggled = output<void>();
  readonly removed = output<void>();
  readonly quantityStepped = output<number>();
  readonly quantityChanged = output<string>();
  readonly priceChanged = output<string>();
  readonly discountChanged = output<string>();
  readonly descriptionChanged = output<string>();
  readonly vatChanged = output<string>();
  readonly stockToggled = output<boolean>();

  /**
   * Le voci che restano leggibili a **card chiusa**: SKU e disponibilità.
   *
   * Lo SKU è un dato visibile della riga (`11` C, 19/08): al banco, con taglie e
   * colori, è quello che fa verificare a colpo d'occhio di aver preso la
   * variante giusta. La disponibilità va in coda, staccata, ed è l'unica che può
   * chiedere attenzione.
   */
  protected metaItems(): readonly DocumentLineCardMeta[] {
    const riga = this.line();
    const voci: DocumentLineCardMeta[] = [];
    if (riga.sku) {
      voci.push({ text: riga.sku });
    }
    voci.push({
      text: `Disp. ${riga.available}`,
      trailing: true,
      tone: this.availabilityHint() ? 'warning' : 'default',
    });
    return voci;
  }

  protected onInput(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected onChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
