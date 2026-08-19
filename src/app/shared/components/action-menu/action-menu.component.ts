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

  readonly actionSelected = output<string>();

  protected readonly open = signal(false);

  protected toggle(event: Event): void {
    event.stopPropagation();
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
