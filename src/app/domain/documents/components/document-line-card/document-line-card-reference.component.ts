import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import type { FormGroup } from '@angular/forms';

/**
 * **La riga «Documento collegato», su schermo compatto.**
 *
 * ⛔ Non è una card, e non deve esserlo: un riferimento a un altro documento
 * non ha quantità, prezzo né IVA. La Fattura lo rendeva come **card prodotto
 * normale** — con Cod. articolo, SKU, EAN, Sconto e IVA modificabili — mentre
 * il suo stesso desktop lo rendeva come banda, perché la riga condivisa ha il
 * ramo. Due viste dello stesso dato che dicevano cose diverse.
 *
 * ⭐ Era già scritta due volte, con due prefissi di classe
 * (`co-form__mobile-source-row` e `sd-form__mobile-source-row`) e lo stesso
 * markup dentro. Due nomi per la stessa cosa sono due occasioni di divergere:
 * la prima correzione ne raggiunge una sola.
 *
 * ⚠️ Il titolo è un `<input>` e non un testo: su un riferimento l'operatore
 * può correggere la dicitura che finirà stampata, e il desktop glielo lascia
 * fare. Toglierlo qui renderebbe la vista compatta meno capace di quella larga.
 */
@Component({
  selector: 'app-document-line-card-reference',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <!-- ⛔ **Lo scope di form serve QUI dentro.** «formControlName» si risolve
         nell'albero di DICHIARAZIONE, non in quello del DOM: il «formGroupName»
         che il consumer mette sull'host vale per il SUO template, non per
         questo. Senza, l'input lancia NG01050 e la banda si disegna vuota —
         icona e cestino, nessun testo. Misurato nel browser, non in prova.
         E' la stessa forma dei due gemelli, document-line-row e
         document-line-card-body, che avvolgono entrambi con un ng-container
         [formGroup]: questo era l'unico dei tre a non farlo. -->
    <ng-container [formGroup]="group()">
      <article class="doc-line-card-reference">
        <span class="doc-line-card-reference__icon" aria-hidden="true">
          <i class="pi pi-file"></i>
        </span>
        <span class="doc-line-card-reference__copy">
          <small>Documento collegato</small>
          <input
            class="doc-form__source-title"
            type="text"
            formControlName="productName"
            aria-label="Riferimento al documento collegato"
          />
        </span>
        <button
          type="button"
          class="doc-form__line-remove"
          aria-label="Rimuovi collegamento"
          [disabled]="readOnly() || !canRemove()"
          (click)="removeRequested.emit()"
        >
          <i class="pi pi-trash" aria-hidden="true"></i>
        </button>
      </article>
    </ng-container>
  `,
  styleUrl: './document-line-card-reference.component.scss',
})
export class DocumentLineCardReferenceComponent {
  /** Il gruppo della riga: da qui l'input del titolo prende il suo controllo. */
  readonly group = input.required<FormGroup>();
  readonly readOnly = input(false);
  readonly canRemove = input(true);
  readonly removeRequested = output<void>();
}
