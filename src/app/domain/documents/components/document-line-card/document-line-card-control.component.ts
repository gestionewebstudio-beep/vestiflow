import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Uno dei valori sempre visibili nella testata della card: etichetta piccola
 * sopra, controllo sotto.
 *
 * Sono tre e restano tre — è la forma della striscia — ma **quali** siano lo
 * decide il documento: quantità e totale li vuole chiunque, in mezzo ci va il
 * prezzo di vendita in un ordine cliente e il costo in un arrivo merce.
 *
 * L'ultimo si allinea a destra da sé, senza che nessuno glielo dica: è il
 * totale, e i totali stanno a destra come in ogni tabella dell'app.
 */
@Component({
  selector: 'app-document-line-card-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'doc-line-card-control' },
  template: `<span class="doc-line-card-control__label">{{ label() }}</span
    ><ng-content />`,
  styleUrl: './document-line-card-control.component.scss',
})
export class DocumentLineCardControlComponent {
  readonly label = input.required<string>();
}
