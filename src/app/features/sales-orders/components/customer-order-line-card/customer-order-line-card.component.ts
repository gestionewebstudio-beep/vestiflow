import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { ButtonComponent } from '@shared/components/button/button.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import { DocumentLineSuggestionsComponent } from '@domain/documents/components/document-line-suggestions/document-line-suggestions.component';

import type {
  CustomerOrderLineCardGroup,
  CustomerOrderLineCardVm,
  LineCodeField,
} from '../../models/customer-order-line-card.model';

export type { LineCodeField };

/**
 * Riga documento come card, sotto lg.
 *
 * Gemella di `goods-receipt-line-card`: stessa idea, contenuti diversi. Non
 * sono un componente solo perche' le due righe portano campi diversi — l'arrivo
 * merce ha costo e prezzo di vendita, l'ordine cliente sconto, IVA e impegno di
 * magazzino — e fonderle richiederebbe una dozzina di flag che accendono e
 * spengono pezzi di template. Condividono la forma (testata compatta, corpo
 * espandibile a gruppi) attraverso i token e i componenti condivisi, non
 * attraverso un antenato comune.
 *
 * Dumb: edita il FormGroup che riceve e delega al form tutto cio' che richiede
 * di sapere qualcosa sul documento — ricerca prodotto, IVA, duplicazione,
 * eliminazione.
 */
@Component({
  selector: 'app-customer-order-line-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    DocumentLineSuggestionsComponent,
    ReactiveFormsModule,
    SelectMenuComponent,
  ],
  templateUrl: './customer-order-line-card.component.html',
  styleUrl: './customer-order-line-card.component.scss',
})
export class CustomerOrderLineCardComponent {
  readonly line = input.required<CustomerOrderLineCardGroup>();
  readonly vm = input.required<CustomerOrderLineCardVm>();
  readonly open = input(false);

  /**
   * Due disposizioni della testata compatta per lo stesso contenuto. `order` e'
   * quella scelta sull'Ordine cliente — elimina e nome in cima, poi variante,
   * meta e i tre controlli; `registry` e' quella dei documenti di registro, che
   * mette il chevron a sinistra e i tre valori come metric chip.
   *
   * Il corpo espanso e' lo stesso in entrambe: cambia solo cio' che si vede a
   * card chiusa.
   */
  readonly layout = input<'order' | 'registry'>('registry');

  readonly toggled = output<void>();
  /** Elimina con conferma (testata «order»). */
  readonly removeRequested = output<void>();
  /** Elimina diretta (testata «registry» e azione in fondo al corpo). */
  readonly removed = output<void>();
  readonly duplicated = output<void>();
  /** +1 o -1 sulla quantita': il form applica il minimo e marca il documento sporco. */
  readonly quantityStepped = output<1 | -1>();
  readonly codeCommitted = output<LineCodeField>();
  /** Entrata in un campo codice: il form chiude una scelta aperta altrove. */
  readonly codeFocused = output<LineCodeField>();
  /** Uscita da un campo codice: il form chiude la scelta rimasta aperta. */
  readonly codeBlurred = output<void>();
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
