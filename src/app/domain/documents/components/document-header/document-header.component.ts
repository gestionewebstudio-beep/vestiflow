import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';

import { DocumentMobilePanelComponent } from '../document-mobile-panel/document-mobile-panel.component';

/**
 * **La testata di un documento: dichiarata una volta, resa in due vesti.**
 *
 * ## Il difetto che chiude
 *
 * Misurato il 24/08/2026 su otto maschere: i loro template sono **7.240
 * righe**, e la sola testata ne occupa **2.152 — il 30%**. Metà di quelle era
 * la **seconda copia** dell'altra metà: ogni maschera scriveva i propri campi
 * due volte, una nella griglia desktop e una nel pannello mobile.
 *
 * Sul Trasferimento: 74 righe contro 78. Stessi quattro campi, stesse opzioni,
 * stessi gestori; cambiavano l'identificativo (`tr-m-*` contro `tr-*`) e la
 * formula dell'`aria-label`. Non era una vista diversa — era la stessa vista
 * scritta due volte, dentro lo stesso file.
 *
 * ⛔ **E ogni correzione ne raggiungeva una sola.** È la stessa famiglia del
 * difetto che la riga comune ha appena chiuso, un piano più sopra.
 *
 * ## Come proietta una volta sola in due posti
 *
 * `<ng-content>` si riempie **una volta**: due `<ng-content>` in due rami di un
 * `@if` lascerebbero il secondo vuoto. I campi entrano quindi in un
 * `<ng-template>`, e i due rami ne montano un'istanza ciascuno — quello che si
 * vede è sempre uno solo, perché le due viste sono esclusive.
 *
 * ⚠️ **Esclusive, non nascoste col CSS**: è la regola della «vista sola viva»,
 * e qui vale doppio — con due viste vive gli identificativi dei campi non
 * sarebbero univoci, e ogni pannello condiviso potrebbe aprirsi in quella che
 * non si vede.
 *
 * ## Cosa NON entra qui
 *
 * Quali campi ci sono. Che l'Arrivo merce abbia il fornitore e l'Ordine cliente
 * il cliente non è una copia: è un campo diverso, e resta della maschera. Qui
 * sta la **forma** — la griglia, il pannello apribile, il riepilogo chiuso.
 */
@Component({
  selector: 'app-document-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, DocumentMobilePanelComponent],
  template: `
    <ng-template #campi><ng-content /></ng-template>

    @if (compatto()) {
      <div class="doc-panels">
        <app-document-mobile-panel
          [title]="title()"
          [summaryParts]="summaryParts()"
          [icon]="icon()"
          [statusText]="statusText()"
          [statusReady]="statusReady()"
          [initiallyOpen]="initiallyOpen()"
        >
          @if (sectionTitle(); as sezione) {
            <p class="doc-panel__section">{{ sezione }}</p>
          }
          <div class="doc-panel__fields" [class.doc-panel__fields--two]="twoColumns()">
            <ng-container [ngTemplateOutlet]="campi" />
          </div>
        </app-document-mobile-panel>
      </div>
    } @else {
      <div
        class="doc-form__grid doc-form__grid--header"
        [class.doc-form__grid--header-compact]="dense()"
        [class.doc-form__header-row]="flowRow()"
        [class.doc-form__header-row--secondary]="secondary()"
      >
        <ng-container [ngTemplateOutlet]="campi" />
      </div>
    }
  `,
})
export class DocumentHeaderComponent {
  private readonly viewport = inject(ViewportService);

  /** Il nome del contesto principale mostrato a pannello chiuso. */
  readonly title = input('');
  /** La riga di sintesi sotto il titolo: sede · data · stato. */
  readonly summaryParts = input<readonly string[]>([]);
  readonly icon = input('pi-file');
  readonly statusText = input('');
  readonly statusReady = input(false);
  readonly initiallyOpen = input(true);
  /** Il titoletto sopra i campi, dove il documento ne ha uno. */
  readonly sectionTitle = input('');
  /**
   * Griglia densa: la usano le testate con pochi campi, dove le colonne larghe
   * lascerebbero mezza riga vuota.
   */
  readonly dense = input(false);

  /**
   * Sopra `lg` la fascia è **flex a larghezza proporzionale**: i campi riempiono
   * la card e perdono il filo inferiore, e ogni campo dichiara il proprio minimo
   * con `--doc-field-min`.
   *
   * ⛔ **Era una lacuna di questo componente, non una scelta.** Rendeva solo
   * `doc-form__grid--header`, quindi tre maschere hanno **perso**
   * `doc-form__header-row` migrando: da 1025px in su la fascia tornava a
   * griglia `auto-fill` e le celle riacquistavano il filo sotto. Sull'Arrivo
   * merce, dove la fascia successiva ha un filo sopra, i due si sommavano e al
   * confine si vedeva un **filo doppio**.
   *
   * ⚠️ Nessuno l'ha aggirato con un `::ng-deep` o un foglio locale, che è la
   * scelta giusta: un `::ng-deep` è un difetto di API del componente
   * condiviso, e la correzione è aggiungere il punto di regolazione mancante.
   */
  readonly flowRow = input(false);

  /**
   * La fascia **secondaria**: fondo tenue e filo sopra, per i dati che non
   * servono a iniziare a lavorare — il documento della controparte, il
   * trasporto.
   */
  readonly secondary = input(false);

  /**
   * Su telefono i campi si affiancano a due a due invece di impilarsi.
   *
   * ⚠️ Serve dove due campi brevi stanno bene sulla stessa riga — Data accanto a
   * Consegna, Data accanto a Modalità prezzo — e senza, il pannello si allunga
   * di una fascia per ogni campo.
   */
  readonly twoColumns = input(false);

  protected readonly compatto = this.viewport.compact;
}
