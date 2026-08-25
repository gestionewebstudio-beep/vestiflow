import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';
import { ButtonComponent } from '@shared/components/button/button.component';

/**
 * ⭐ **La barra azioni del documento: Chiudi, Salva, e quello che il documento
 * ci mette in mezzo.**
 *
 * ## La grammatica non e' stata inventata: e' stata MISURATA
 *
 * Prima dell'estrazione, l'ordine sinistra→destra delle sette maschere
 * documentali era gia' identico in tutte e sette (`docs/…TESTATE…` §34.6):
 *
 * ```text
 * [nota di stato] · Chiudi (ghost) · [azioni specifiche (secondary)…] · Salva (primary)
 * ```
 *
 * Il componente la fissa, non la decide.
 *
 * ## ⛔ Che cosa NON sa, e non deve sapere
 *
 * Non conosce i tipi documento — `check-document-grammar` lo verifica. Non sa
 * come si salva, che cosa succede dopo, ne' perche' un'azione specifica esiste:
 * quelle stanno nel documento che la ospita.
 *
 * ⚠️ **`saveType` non e' un'eccezione a questa regola.** Non dice al componente
 * _come_ si salva: dice che **pulsante rendere**. Cinque maschere salvano con
 * `<form (ngSubmit)>` e un `type="submit"` — scelta deliberata, documentata in
 * `no-implicit-submit.directive` il 24/08/2026 — e tre con un gestore di clic.
 * Rendere sempre un `submit` romperebbe le seconde; sempre un `button`
 * scavalcherebbe `ngSubmit` nelle prime.
 *
 * ## UNA dichiarazione, DUE vesti
 *
 * ⛔ Prima ogni maschera dichiarava la barra **due volte** — `doc-form__actions`
 * e `doc-form__mobile-actions`, quattordici dichiarazioni per sette barre. E il
 * costo si vedeva: nel Trasferimento la copia mobile aveva un `@if` con **rami
 * identici**, perche' era stata copiata da quella di scrivania dove i rami
 * differivano davvero, e la differenza era stata persa da una copia sola.
 *
 * Qui la dichiarazione e' una. La veste la sceglie `ViewportService.compact()`,
 * che risponde alla soglia `lg` — la stessa a cui commutavano le due copie.
 *
 * ⚠️ La variante di Chiudi cambia con la veste (`ghost` di scrivania,
 * `secondary` compatta) e **non e' deriva**: e' scritto in `regole-stile-ui` §5.
 * Cambia l'aspetto, non il significato.
 *
 * ## ⭐ Ctrl/Cmd + S, ovunque
 *
 * Decisione del proprietario, 25/08/2026: la scorciatoia di salvataggio vale su
 * ogni maschera, non solo sull'Arrivo merce dove esisteva.
 *
 * ⭐ **E' implementata come «premi il pulsante Salva»**, non come «chiama il
 * salvataggio»: cliccare un `type="submit"` invia il modulo, cliccare un
 * `type="button"` emette. Una riga sola serve entrambe le modalita', ed e'
 * letteralmente cio' che la scorciatoia significa.
 *
 * ⚠️ Il pulsante disabilitato non risponde al clic, quindi «in salvataggio» e
 * «sola lettura» sono gia' coperti senza un secondo controllo. E dietro un
 * dialogo modale il resto della pagina e' inerte per il browser: la scorciatoia
 * non salva alle spalle di una conferma aperta.
 */
@Component({
  selector: 'app-document-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './document-actions.component.html',
  styleUrl: './document-actions.component.scss',
  host: {
    '[class.doc-actions--compact]': 'compact()',
    '(window:keydown)': 'onWindowKeydown($event)',
  },
})
export class DocumentActionsComponent {
  private readonly viewport = inject(ViewportService);
  private readonly document = inject(DOCUMENT);

  /**
   * L'etichetta del salvataggio. «Salva documento» ovunque
   * (`regole-stile-ui` §5), tranne dove il tipo nomina la propria operazione —
   * il banco dice «Concludi vendita».
   */
  readonly saveLabel = input<string>('Salva documento');

  /** Che pulsante rendere. Vedi la nota sopra: e' rendering, non policy. */
  readonly saveType = input<'submit' | 'button'>('submit');

  /** Salvataggio in corso: spegne entrambi i comandi. */
  readonly saving = input<boolean>(false);

  /**
   * Documento in sola lettura: il salvataggio non e' disponibile.
   *
   * ⛔ La barra **non sparisce**. Prima la copia mobile si nascondeva del tutto
   * (`@if (!formReadOnly())`) mentre quella di scrivania restava con il Salva
   * spento: due comportamenti per lo stesso stato, e sul telefono spariva anche
   * Chiudi.
   */
  readonly readOnly = input<boolean>(false);

  /** «Chiudi» e' stato premuto. Che cosa comporti lo decide il documento. */
  readonly closeRequested = output<void>();

  /** «Salva» e' stato premuto. ⚠️ Solo con `saveType === 'button'`. */
  readonly saveRequested = output<void>();

  protected readonly compact = this.viewport.compact;

  /**
   * ⚠️ `{ read: ElementRef }` non e' decorativo: senza, un riferimento di
   * template posato su un COMPONENTE restituisce l'istanza della classe, non
   * l'elemento — e `.nativeElement` e' `undefined`. La prima stesura lo
   * ometteva, e Ctrl+S falliva con «Cannot read properties of undefined».
   */
  private readonly saveButton = viewChild('saveButton', { read: ElementRef });

  protected readonly saveDisabled = () => this.saving() || this.readOnly();

  protected onWindowKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') {
      return;
    }
    event.preventDefault();
    // «Premi il pulsante», non «chiama il salvataggio»: cosi' la scorciatoia
    // fa esattamente quello che fa il clic, in entrambe le modalita'.
    // `app-button` ha l'host `display: contents`: nel flusso ci sta il <button>
    // interno, ed e' quello da premere.
    // ⭐ **Prima si toglie il fuoco al campo attivo** (soluzione A, decisa dal
    // proprietario il 25/08/2026). Non aggiunge un comportamento: riproduce
    // quello che il CLIC gia' fa, perche' premere un pulsante toglie il fuoco
    // al campo che lo aveva.
    //
    // ⚠️ Serve, ed e' misurato: la cella a ricerca-e-selezione conferma quello
    // che si e' digitato proprio sul blur («Uscire dal campo conferma quello
    // che si e' digitato, come il Tab»). Senza, Ctrl+S battuto mentre si scrive
    // in quella cella salverebbe il valore PRECEDENTE, e in silenzio.
    //
    // ⭐ Per gli altri campi non servirebbe — nessun controllo di riga usa
    // `updateOn: 'blur'`, quindi il valore entra nel form a ogni battuta — ma
    // farlo comunque costa una riga e toglie la domanda «quale cella e'?».
    const attivo = this.document.activeElement;
    if (attivo instanceof HTMLElement) {
      attivo.blur();
    }
    const host = this.saveButton()?.nativeElement as HTMLElement | undefined;
    host?.querySelector('button')?.click();
  }

  protected onSave(): void {
    if (this.saveType() === 'button') {
      this.saveRequested.emit();
    }
  }
}
