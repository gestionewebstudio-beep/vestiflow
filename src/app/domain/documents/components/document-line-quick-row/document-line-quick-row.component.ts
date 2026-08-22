import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * **La riga di inserimento, in fondo alla tabella righe.** Una sola, come la
 * riga e la sua intestazione (`11` A15).
 *
 * ⭐ Sta DENTRO la griglia, non sopra: è lì che l'operatore la cerca dopo aver
 * guardato l'ultima riga inserita, ed è dove l'hanno tutte le maschere che
 * inseriscono articoli.
 *
 * ⛔ **Una riga vuota non è una riga di documento.** Qui si digita o si spara,
 * e la riga nasce solo quando un articolo è davvero risolto (`11` A14): questo
 * non impedisce di usare la stessa interfaccia — dice solo che niente si salva
 * finché non c'è un articolo.
 *
 * La sintassi del moltiplicatore (`3*codice`) è comune: la riconosce il servizio
 * dei codici, non la maschera.
 */
@Component({
  selector: 'tr[app-document-line-quick-row]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-line-quick-row.component.html',
  styleUrl: './document-line-quick-row.component.scss',
})
export class DocumentLineQuickRowComponent {
  readonly inputId = input.required<string>();
  readonly value = input('');
  readonly disabled = input(false);
  readonly placeholder = input('Scansiona o cerca prodotto… (Invio per aggiungere)');
  /**
   * ⚠️ Un nome accessibile vero, non il solo segnaposto: il segnaposto sparisce
   * appena si digita, e chi ascolta resterebbe senza il nome del campo.
   */
  readonly ariaLabel = input('Scansiona o cerca un articolo');
  /** Messaggio di esito: codice non trovato, errore di rete. */
  readonly message = input<string | null>(null);

  readonly valueChanged = output<string>();
  readonly committed = output<void>();

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('quickInput');

  /** Il fuoco torna qui dopo ogni inserimento: è la porta, e resta pronta. */
  focus(selectText = false): void {
    const input = this.inputRef()?.nativeElement;
    if (!input) {
      return;
    }
    input.focus();
    if (selectText) {
      input.select();
    }
  }

  protected onInput(event: Event): void {
    this.valueChanged.emit((event.target as HTMLInputElement).value);
  }

  protected onEnter(event: Event): void {
    event.preventDefault();
    this.committed.emit();
  }
}
