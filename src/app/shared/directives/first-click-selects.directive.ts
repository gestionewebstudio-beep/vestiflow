import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Il mouse a due tempi dentro le righe documento (specifica §4.6).
 *
 * **Primo clic su un campo che non aveva il fuoco: il valore si seleziona
 * tutto**, pronto da sovrascrivere. **Secondo clic: il cursore va dove si
 * clicca**, senza cancellare niente. **Trascinando** si seleziona il pezzo che
 * si è trascinato, e la selezione resta quella.
 *
 * È la stessa promessa che la tastiera fa già entrando in un campo (§4.1): si
 * arriva e si può scrivere. Senza, entrando col mouse su una quantità bisogna
 * prima cancellare l'«1» che c'è.
 *
 * ⚠️ «Primo clic seleziona tutto» **non è nativo**: il browser mette il cursore
 * dove clicchi, sempre. E la formulazione ingenua «seleziona quando il campo
 * prende il fuoco» è peggio del male che cura — cancellerebbe il valore al primo
 * tasto dopo un clic messo apposta a metà cifra. Serve sapere se il campo
 * **aveva già** il fuoco, e lo si può sapere solo prima che il clic glielo dia:
 * di qui la coppia `mousedown` (chiedo) / `mouseup` (decido).
 *
 * Si applica **da sola** a ogni input di riga documento (`.doc-form__input--table`)
 * più a chi la chiede per nome: basta importarla nel componente, senza toccare i
 * template uno per uno — così non la si può dimenticare su una colonna nuova.
 */
@Directive({
  selector: 'input[appFirstClickSelects], input.doc-form__input--table',
  host: {
    '(mousedown)': 'onMouseDown()',
    '(mouseup)': 'onMouseUp()',
  },
})
export class FirstClickSelectsDirective {
  private readonly host = inject<ElementRef<HTMLInputElement>>(ElementRef);

  /** Il campo aveva il fuoco PRIMA che questo clic glielo desse. */
  private wasFocused = false;

  protected onMouseDown(): void {
    this.wasFocused = globalThis.document.activeElement === this.host.nativeElement;
  }

  protected onMouseUp(): void {
    // Secondo clic in poi: il cursore va dove l'operatore l'ha messo.
    if (this.wasFocused) {
      return;
    }
    const input = this.host.nativeElement;
    // Ha trascinato: la selezione è sua, non gliela si riscrive.
    if (input.selectionStart !== input.selectionEnd) {
      return;
    }
    // `select()` non esiste su ogni tipo di input, e su alcuni (number, date) i
    // browser lo rifiutano: si prova, e se non si può il clic resta quello
    // normale del browser — che è comunque un comportamento sensato.
    try {
      input.select();
    } catch {
      // Tipo di campo che non ammette la selezione: nulla da fare.
    }
  }
}
