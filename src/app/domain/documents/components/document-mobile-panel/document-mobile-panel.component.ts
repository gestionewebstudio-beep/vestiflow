import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';

/** Aggancio aria-controls stabile fra head e corpo, unico per istanza. */
let nextPanelId = 0;

/**
 * Pannello apribile della testata documento su mobile (reference «Ordine
 * cliente»): head con medaglione icona, titolo e riepilogo, corpo proiettato
 * via ng-content. Dumb: lo stato di apertura è interno (parte da
 * `initiallyOpen`, poi decide l'utente col toggle — non si richiude da solo
 * quando i dati si completano). Visibile solo sotto lg, come il contenitore
 * .doc-panels; le classi del contenuto proiettato (doc-panel__fields, …) sono
 * vestite dal foglio globale styles/_document-form-mobile.scss.
 */
@Component({
  selector: 'app-document-mobile-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-mobile-panel.component.html',
  styleUrl: './document-mobile-panel.component.scss',
})
export class DocumentMobilePanelComponent {
  /** Titolo del head (o riepilogo del dato scelto, es. nome cliente). */
  readonly title = input.required<string>();
  /** Voci del riepilogo sotto il titolo: separate col puntino, a capo intere. */
  readonly summaryParts = input<readonly string[]>([]);
  /** Classe PrimeIcons del medaglione (es. 'pi-user'). */
  readonly icon = input<string>('');
  /** Riga di stato in fondo al corpo: dice cosa manca (assente se vuota). */
  readonly statusText = input<string>();
  /** Dot verde (dati pronti) o ambra (dati mancanti) accanto allo stato. */
  readonly statusReady = input(false);
  /** Stato di apertura all'ingresso; poi comanda il toggle dell'utente. */
  readonly initiallyOpen = input(false);

  protected readonly bodyId = `doc-panel-body-${++nextPanelId}`;

  /** Aperto/chiuso: interno, inizializzato da initiallyOpen. */
  protected readonly open = linkedSignal(() => this.initiallyOpen());

  protected toggle(): void {
    this.open.update((open) => !open);
  }
}
