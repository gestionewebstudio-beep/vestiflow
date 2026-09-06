import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';

import type { DocumentPrefillErrorStore } from '../../state/document-prefill-error.store';

/**
 * ⭐ **«Il precompilato non è arrivato»**, detto una volta sola.
 *
 * ## Perché l'avviso esiste, e non è cosmetica
 *
 * Senza, resterebbe una **maschera vuota, indistinguibile da un documento nuovo
 * legittimo**: chi salvasse creerebbe la cosa sbagliata credendo di aver fatto
 * l'altra. È il motivo scritto nei sei commenti che questo componente sostituisce
 * — identici parola per parola, perché copiati.
 *
 * ## ⛔ La misura (25/08/2026)
 *
 * Otto righe di markup **byte-identiche in sei maschere**: stesso tono, stesso
 * messaggio, stessa etichetta di congedo, stesso gestore. Non una somiglianza:
 * una copia.
 *
 * ⚠️ E l'etichetta è esattamente il genere di cosa che deriva. In una sola
 * giornata questa estrazione ne ha trovate cinque versioni per le note, due per
 * il salvataggio del Movimento di magazzino, tre per il dialogo d'uscita. Un
 * testo ripetuto in sei posti resta uguale finché qualcuno non ne tocca uno.
 *
 * ## ⛔ Chi NON ce l'ha, e perché è giusto così
 *
 * Ordine fornitore e Vendita/Reso al banco non hanno questo avviso, e non è una
 * lacuna: **non hanno una precompilazione che possa fallire**. I loro «prefill»
 * sono la sede predefinita dell'operatore e il pannello prodotto — nessun
 * `duplicateFrom`, nessun documento da rileggere, niente che possa non arrivare.
 */
@Component({
  selector: 'app-document-prefill-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InlineBannerComponent],
  templateUrl: './document-prefill-error.component.html',
  styleUrl: './document-prefill-error.component.scss',
})
export class DocumentPrefillErrorComponent {
  /**
   * Lo store della maschera.
   *
   * ⚠️ Si passa lo STORE, non il messaggio: così il congedo torna a chi lo
   * possiede senza un secondo `output` da ricollegare in sei posti — ed è il
   * ricollegamento che si dimentica.
   */
  readonly store = input.required<DocumentPrefillErrorStore>();
}
