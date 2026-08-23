import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { DocumentLineCardComponent } from '@domain/documents/components/document-line-card/document-line-card.component';
import { DocumentLineCardControlComponent } from '@domain/documents/components/document-line-card/document-line-card-control.component';
import { DocumentLineCardFieldComponent } from '@domain/documents/components/document-line-card/document-line-card-field.component';
import { DocumentLineCardGroupComponent } from '@domain/documents/components/document-line-card/document-line-card-group.component';
import type { DocumentLineCardMeta } from '@domain/documents/components/document-line-card/document-line-card.model';
import { DocumentLineSelectCellComponent } from '@domain/documents/components/document-line-select-cell/document-line-select-cell.component';
import { DocumentLineUnitCellComponent } from '@domain/documents/components/document-line-unit-cell/document-line-unit-cell.component';
import { DocumentLineSuggestionsComponent } from '@domain/documents/components/document-line-suggestions/document-line-suggestions.component';

import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type {
  CustomerOrderLineCardGroup,
  CustomerOrderLineCardVm,
  LineCodeField,
} from '../../models/customer-order-line-card.model';

export type { LineCodeField };

/**
 * Il **contenuto** della riga Ordine cliente dentro la card condivisa.
 *
 * La forma — testata, striscia dei valori sempre visibili, corpo apribile,
 * piede — è di `app-document-line-card`. Qui resta ciò che questo documento ha
 * da dire: prezzo di vendita, sconto, impegno magazzino, seriali, e i tre campi
 * codice con la scelta fra più corrispondenze.
 *
 * Gemella di `goods-receipt-line-card`, che mette gli stessi imbocchi al
 * servizio di un altro documento — costo con la scelta netto/ivato e dati di
 * carico. Restano due componenti perché le due righe **portano campi diversi**:
 * fonderle richiederebbe la dozzina di interruttori che `regole-architettura`
 * chiama per nome. Condividono la forma, non il contenuto.
 *
 * Dumb: edita il FormGroup che riceve e delega al form tutto cio' che richiede
 * di sapere qualcosa sul documento — ricerca prodotto, IVA, eliminazione.
 */
@Component({
  selector: 'app-customer-order-line-card',
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
  templateUrl: './customer-order-line-card.component.html',
  styleUrl: './customer-order-line-card.component.scss',
})
export class CustomerOrderLineCardComponent {
  readonly line = input.required<CustomerOrderLineCardGroup>();
  readonly vm = input.required<CustomerOrderLineCardVm>();
  readonly open = input(false);
  /** Serve alle celle condivise, che riportano la riga negli esiti che emettono. */
  readonly lineIndex = input.required<number>();
  /** Le unità del tenant: le carica la maschera, una volta per documento. */
  readonly unitOfMeasureOptions = input<readonly SelectMenuOption[]>([]);

  readonly toggled = output<void>();
  /** Elimina con conferma (testata «order»). */
  readonly removeRequested = output<void>();
  /** Elimina diretta (testata «registry» e azione in fondo al corpo). */
  readonly removed = output<void>();
  /** +1 o -1 sulla quantita': il form applica il minimo e marca il documento sporco. */
  readonly quantityStepped = output<1 | -1>();
  readonly codeCommitted = output<LineCodeField>();
  /** Entrata in un campo codice: il form chiude una scelta aperta altrove. */
  readonly codeFocused = output<LineCodeField>();
  /**
   * Uscita da un campo codice. Su mobile lo sfocamento **conferma**, come Tab
   * sul desktop: porta il campo perché il form sappia cosa confrontare.
   */
  readonly codeBlurred = output<LineCodeField>();
  /** Voce scelta dalla scelta codici: la card la traduce in id variante. */
  readonly codeSuggestionPicked = output<string>();
  /** L'elemento, non il testo: il form ci misura dove aprire i suggerimenti. */
  readonly productNameTyped = output<HTMLInputElement>();
  readonly productNameFocused = output<HTMLInputElement>();
  readonly productNameBlurred = output<void>();
  readonly productSearchOpened = output<void>();
  readonly suggestionPicked = output<string>();
  readonly commitsChanged = output<string>();
  readonly vatSelected = output<string>();
  readonly unitOfMeasureChanged = output<string>();
  readonly unitManagerRequested = output<void>();

  /**
   * Le tre informazioni che restano leggibili a card chiusa. Quali siano è del
   * documento: qui codice, SKU e disponibilità — quest'ultima in coda, perché è
   * quella che si cerca per prima.
   *
   * Lo SKU arriva come argomento invece di essere letto qui dentro: vive in un
   * `FormControl`, che il template rilegge a ogni giro mentre un `computed` no.
   */
  protected metaItems(vm: CustomerOrderLineCardVm, sku: string): readonly DocumentLineCardMeta[] {
    const meta: DocumentLineCardMeta[] = [
      { text: vm.articleCode ? `Cod. ${vm.articleCode}` : 'Nessun codice' },
    ];
    if (sku) {
      meta.push({ text: `SKU ${sku}` });
    }
    meta.push({
      text: `Disp. ${vm.stockAvailable}`,
      trailing: true,
      tone: vm.availabilityCritical ? 'warning' : 'default',
    });
    return meta;
  }

  /** Il pannello condiviso restituisce l'indice; qui si torna alla variante. */
  protected pickSuggestion(index: number): void {
    const item = this.vm().suggestions[index];
    if (item) {
      this.suggestionPicked.emit(item.variantId);
    }
  }

  /**
   * Stessa traduzione per la scelta aperta da un codice, ma su un'altra lista:
   * indice e voci sono quelli del `codeChoice`, non dei suggerimenti sul nome.
   * Sono due collezioni con lunghezze diverse — confonderle sfaserebbe il pick.
   */
  protected pickCodeSuggestion(index: number): void {
    const item = this.vm().codeChoice?.items[index];
    if (item) {
      this.codeSuggestionPicked.emit(item.variantId);
    }
  }
}
