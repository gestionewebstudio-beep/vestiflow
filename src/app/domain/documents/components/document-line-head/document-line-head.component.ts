import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';
import { TableColumnResizeDirective } from '@shared/directives/table-column-resize.directive';

import { PriceModeMenuComponent } from '../price-mode-menu/price-mode-menu.component';

import type { DocumentLineColumnId } from '../document-line-row/document-line-row.model';

/** Il verso dell'ordinamento su una colonna, o nessuno. */
export type DocumentLineSortDirection = 'asc' | 'desc' | null;

/**
 * **L'intestazione della tabella righe. Una sola, come la riga.**
 *
 * ⛔ Estratta il 22/08/2026, subito dopo la riga, e per un difetto che i test
 * non potevano vedere: migrata la riga, il CORPO aveva le tinte e i separatori
 * di gruppo (`doc-form__col--stock/sale/tax/calc/total/sep`) e l'intestazione
 * del banco no — **13 classi contro 0**. Testata e corpo dicevano due cose
 * diverse sulle stesse colonne, e si vedeva solo a schermo.
 *
 * ⭐ **Una testata è la proiezione delle stesse colonne della riga**: se la riga
 * è una, la sua intestazione non può essere scritta a mano da ogni maschera.
 * Stessa configurazione (`isColumnVisible`), stesse larghezze, stesse classi.
 *
 * **Che cosa resta configurabile**, perché cambia davvero da documento a
 * documento:
 *
 * - l'**ordinamento** per colonna, che il banco non ha (l'ordine delle righe è
 *   quello di scansione) e l'Ordine cliente sì;
 * - l'etichetta della colonna **spunta di magazzino** — «Impegna», «Scarica»,
 *   «Carica» — col suo aiuto;
 * - la **modalità prezzo**, che vive qui nella testata di colonna (`11` A4) e
 *   non in un controllo di testata documento.
 */
@Component({
  selector: 'tr[app-document-line-head]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TableColumnResizeDirective, PriceModeMenuComponent, HoverTooltipComponent],
  templateUrl: './document-line-head.component.html',
})
export class DocumentLineHeadComponent {
  readonly isColumnVisible = input.required<(column: DocumentLineColumnId) => boolean>();
  readonly columnWidth = input.required<(column: DocumentLineColumnId) => string>();
  readonly columnMinWidth = input.required<(column: DocumentLineColumnId) => number>();

  /**
   * La quota della colonna numero riga.
   *
   * ⛔ **Deve essere una quota come le altre**, non i 48px del foglio di
   * stile: con `table-layout: fixed` una colonna in pixel accanto a colonne in
   * percentuale fa dichiarare alla tabella 100% + 48px, e il browser riscala
   * tutto per farcelo stare. Sommando anche questa si arriva a 100% esatto.
   *
   * Vuota lascia decidere al foglio di stile, che e' il comportamento di prima.
   */
  readonly indexColumnWidth = input('');

  /**
   * L'ordinamento delle righe per colonna. ⛔ Spento dove non ha senso: al banco
   * l'ordine è quello in cui i capi sono passati sul lettore.
   */
  readonly sortable = input(false);
  readonly sortColumn = input<string | null>(null);
  readonly sortDirection = input<DocumentLineSortDirection>(null);
  readonly sortAvailable = input(true);
  readonly sortDisabledReason = input<string | null>(null);

  /** Etichetta e aiuto della colonna spunta: le parole sono del documento. */
  readonly stockToggleLabel = input('Impegna magazzino');
  readonly stockToggleTooltip = input('');

  /**
   * L'etichetta della colonna «carica/scarica», distinta da quella di
   * «impegna»: sono due domande diverse e possono comparire insieme.
   */
  readonly loadToggleLabel = input('Carica magazzino');
  readonly loadToggleTooltip = input('');

  /** Modalità prezzo: l'etichetta riflette quella corrente, il menu la cambia. */
  readonly priceLabel = input('Prezzo');
  readonly pricesIncludeVat = input(false);
  readonly priceMenuOpen = input(false);
  readonly readOnly = input(false);

  readonly sortToggled = output<DocumentLineColumnId>();
  readonly columnResizing = output<{ column: DocumentLineColumnId; widthPx: number }>();
  readonly columnResized = output<{ column: DocumentLineColumnId; widthPx: number }>();
  readonly priceMenuToggled = output<void>();
  readonly priceModeChanged = output<boolean>();

  /**
   * Il menu netto/ivato del COSTO, distinto da quello del prezzo.
   *
   * ⛔ Sono due scelte diverse: come si digita il costo d'acquisto e come si
   * digita il prezzo di vendita. L'Arrivo merce può mostrare entrambe le
   * colonne, e con un menu solo cambiare l'una cambierebbe l'altra.
   */
  readonly costLabel = input('Costo');
  readonly costsIncludeVat = input(false);
  readonly costMenuOpen = input(false);
  readonly costMenuToggled = output<void>();
  readonly costModeChanged = output<boolean>();

  protected sortAriaLabel(column: DocumentLineColumnId, label: string): string {
    if (!this.sortable()) {
      return label;
    }
    if (this.sortColumn() !== column) {
      return `${label}: ordina crescente`;
    }
    return this.sortDirection() === 'asc'
      ? `${label}: ordina decrescente`
      : `${label}: togli ordinamento`;
  }
}
