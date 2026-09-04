import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

export interface ActionMenuItem {
  readonly id: string;
  readonly label: string;
  /** Classe PrimeIcons opzionale (es. `pi-copy`). */
  readonly icon?: string;
  /** Azione distruttiva: voce evidenziata in rosso (es. Elimina). */
  readonly danger?: boolean;
}

/**
 * Menu azioni a comparsa ("···"), riusabile per righe di tabella o toolbar
 * compatte. Dumb puro: riceve le voci già filtrate dal chiamante (nessuna
 * voce disabilitata "silenziosa" — chi non è disponibile va omesso a monte)
 * ed emette solo l'id selezionato.
 */
@Component({
  selector: 'app-action-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'action-menu-host',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  templateUrl: './action-menu.component.html',
  styleUrl: './action-menu.component.scss',
})
export class ActionMenuComponent {
  // REASON: ElementRef.nativeElement e' tipizzato any in Angular; il host e' sempre HTMLElement.
  private readonly hostElement: HTMLElement = inject(ElementRef<HTMLElement>)
    .nativeElement as HTMLElement;

  readonly items = input.required<readonly ActionMenuItem[]>();
  readonly ariaLabel = input<string>('Azioni');

  /**
   * Etichetta visibile sul pulsante che apre il menu. Vuota (default) = il
   * trigger resta il quadrato «···» delle righe di tabella, dove lo spazio non
   * c'è e l'icona basta. Valorizzata, il menu diventa un comando NOMINATO da
   * barra strumenti («Esporta»): raccoglie più azioni dietro un pulsante solo
   * senza che l'operatore debba indovinare cosa c'è sotto tre puntini.
   */
  readonly triggerLabel = input<string>('');

  /** Icona del trigger. Cambia solo quando il menu ha un nome proprio. */
  readonly triggerIcon = input<string>('pi-ellipsis-h');

  /**
   * Comando non disponibile ora: il trigger si spegne e non si apre.
   *
   * ⚠️ Spento e VISIBILE, non nascosto: un menu che sparisce fa credere che il
   * comando non esista (`14` §11).
   */
  readonly disabled = input<boolean>(false);

  /**
   * Operazione in corso dietro una delle voci: il trigger si spegne e l'icona
   * gira.
   *
   * ⛔ Senza, un comando lento dentro un menu non ha **nessun** modo di dirlo:
   * la voce si chiude appena premuta e la barra torna com'era. È il motivo per
   * cui questo input esiste — la generazione di N PDF dura secondi.
   */
  readonly busy = input<boolean>(false);

  /**
   * Perché il comando non è disponibile.
   *
   * ⛔ Serve **anche senza mouse**: raccolti in un menu su schermo stretto, i
   * comandi non hanno un hover su cui appoggiare la spiegazione (`14` §11). Il
   * motivo viaggia quindi in un elemento descrittivo collegato al trigger, che
   * resta focusabile proprio per poterlo annunciare.
   */
  readonly disabledReason = input<string>('');

  /** Identità dell'elemento che descrive il trigger spento. */
  protected readonly reasonId = `action-menu-reason-${Math.random().toString(36).slice(2, 9)}`;

  readonly actionSelected = output<string>();

  protected readonly open = signal(false);

  protected toggle(event: Event): void {
    event.stopPropagation();
    // ⛔ `aria-disabled` descrive, non impedisce: il blocco sta qui. Il trigger
    // resta nel giro del Tab apposta, per poter dire perché non si può.
    if (this.disabled() || this.busy()) {
      return;
    }
    this.open.update((value) => !value);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onSelect(event: Event, itemId: string): void {
    event.stopPropagation();
    this.close();
    this.actionSelected.emit(itemId);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!this.hostElement.contains(target)) {
      this.close();
    }
  }
}
