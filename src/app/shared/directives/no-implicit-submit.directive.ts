import { Directive } from '@angular/core';

/**
 * **Invio in un campo di testata non salva il documento.**
 *
 * ⛔ **Difetto misurato il 24/08/2026 su cinque maschere** — Trasferimento,
 * Rettifica, Fatture, Ordine fornitore, Registrazione fattura: tutte quelle che
 * salvano con `<form (ngSubmit)>` e pulsanti `type="submit"`.
 *
 * L'HTML prevede la **submission implicita**: in un modulo con un pulsante
 * submit, premere Invio in un campo di testo lo invia. Né il campo Numero né il
 * campo Data facevano `preventDefault`, quindi battere il numero documento e
 * premere Invio **salvava**.
 *
 * ⚠️ **Era invisibile a un test scritto male, e per poco non lo dichiaravo
 * assente.** Verificare che il servizio di salvataggio non fosse stato chiamato
 * dava verde — ma per la ragione sbagliata: il modulo veniva inviato eccome, e
 * il salvataggio si fermava sulla validazione perché il documento non aveva
 * righe. Su un documento **completo** sarebbe partito. La prova giusta guarda
 * l'evento `submit`, non il servizio.
 *
 * ## Cosa fa, e cosa NON fa
 *
 * Ferma la sola **azione predefinita** del tasto. Non chiama `stopPropagation`,
 * quindi ogni Invio che ha un significato suo continua ad averlo: la conferma di
 * una cella di riga, la scelta di un suggerimento, il passaggio al campo
 * successivo. Quei gestori stanno più vicini al bersaglio e girano prima.
 *
 * ⭐ **Il salvataggio resta esplicito**: il pulsante Salva, che è un `submit`
 * vero e passa da `ngSubmit` come prima, e la scorciatoia Ctrl/Cmd+S.
 *
 * ⚠️ La `<textarea>` è esclusa perché lì Invio scrive una riga nuova, e non
 * invia mai — è già il comportamento dell'HTML, e toccarlo sarebbe di troppo.
 */
@Directive({
  selector: 'form[appNoImplicitSubmit]',
  host: {
    '(keydown.enter)': 'onEnter($event)',
  },
})
export class NoImplicitSubmitDirective {
  protected onEnter(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    // Un pulsante premuto con Invio deve fare quello che fa un clic: se il
    // bersaglio e' un comando, l'Invio e' il modo di premerlo da tastiera.
    if (target instanceof HTMLButtonElement || target instanceof HTMLTextAreaElement) {
      return;
    }
    if (target.getAttribute('role') === 'button' || target.isContentEditable) {
      return;
    }
    event.preventDefault();
  }
}
