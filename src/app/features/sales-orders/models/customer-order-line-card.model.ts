import type { FormControl } from '@angular/forms';

import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * I controlli che la card di riga edita. Tipo strutturale: il FormGroup della
 * riga (che ne ha di piu') e' assegnabile per width subtyping, come per la card
 * dell'arrivo merce.
 */
export interface CustomerOrderLineCardControls {
  readonly productName: FormControl<string>;
  readonly articleCode: FormControl<string>;
  readonly sku: FormControl<string>;
  readonly barcode: FormControl<string>;
  readonly quantity: FormControl<number>;
  readonly unitPrice: FormControl<string>;
  readonly discount: FormControl<string>;
  readonly serialNumbersText: FormControl<string>;
  readonly commitsStock: FormControl<boolean>;
}

export interface CustomerOrderLineCardGroup {
  readonly controls: CustomerOrderLineCardControls;
}

/**
 * Tutto cio' che la card mostra ma non calcola.
 *
 * Esiste per una ragione precisa: la card leggeva ventitre' valori derivati
 * chiamando altrettanti metodi del form, uno per campo. Passarglieli come
 * `input()` separati avrebbe prodotto un componente con trenta ingressi — che
 * non e' un componente (regole-architettura, «Quando NON estrarre»). Raccolti
 * in un oggetto solo, la card ne prende tre.
 *
 * Il criterio di cosa entra qui: un valore che il form sa e la card non puo'
 * derivare da sola. Cio' che si legge dai controlli (nome, SKU, quantita') non
 * ci sta: quello arriva dal FormGroup.
 */
/**
 * Suggerimento gia' pronto da mostrare. La card non riceve la variante grezza:
 * comporre «SKU · EAN · prezzo» richiede la formattazione della valuta, che e'
 * lavoro del form, non di chi disegna.
 */
export interface LineSuggestion {
  readonly variantId: string;
  readonly title: string;
  readonly detail: string;
}

export interface CustomerOrderLineCardVm {
  /** Posizione nell'array righe: serve agli id dei campi e alle etichette ARIA. */
  readonly index: number;
  readonly variantLabel: string;
  readonly articleCode: string;
  readonly unitOfMeasure: string;
  readonly stockAvailable: string;
  /** Avviso non bloccante sopra la riga (quantita' oltre la disponibile). */
  readonly availabilityHint: string | null;
  readonly availabilityCritical: boolean;
  /** Riga incompleta: la card lo segnala col bordo, non impedisce nulla. */
  readonly complete: boolean;
  readonly totalLabel: string;
  readonly discountedUnitLabel: string;
  readonly purchaseCostLabel: string;
  /** «Prezzo» o «Prezzo ivato» secondo la modalita' del documento. */
  readonly priceLabel: string;
  readonly vatOptions: readonly SelectMenuOption[];
  readonly vatValue: string;
  readonly suggestions: readonly LineSuggestion[];
  readonly suggestionsOpen: boolean;
  /** L'elenco suggerimenti si apre verso l'alto: sotto non c'e' spazio. */
  readonly suggestAbove: boolean;
  readonly activeSuggestionIndex: number;
  readonly readOnly: boolean;
  /** Etichetta e visibilita' di «Impegna magazzino» (assente sui preventivi). */
  readonly commitsLabel: string | null;
  readonly showSerials: boolean;
  readonly showPurchaseCost: boolean;
}
