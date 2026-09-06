import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * La casella di selezione di una riga o di una testata di tabella.
 *
 * ⛔ **Esiste perché era copiata.** Lo stesso `<input type="checkbox">` con le
 * stesse quattro associazioni, la stessa gestione di `indeterminate` e gli
 * stessi stili vivevano in `document-table` e in `sales-order-table`, e
 * `supplier-order-table` stava per essere la terza copia (`14` §4).
 *
 * ⚠️ **Resta un `<input>` e basta: il `<th>`/`<td>` lo mette la tabella.** Un
 * componente che si portasse dietro la cella romperebbe la semantica di
 * `<table>`, dove fra `<tr>` e il contenuto non può esserci un elemento
 * qualunque.
 *
 * ⚠️ **`aria-label` è obbligatoria**: una casella senza nome, in una colonna
 * senza intestazione testuale, per uno screen reader è «casella di controllo» e
 * nient'altro — venti volte di fila.
 */
@Component({
  selector: 'app-selection-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selection-check.component.html',
  styleUrl: './selection-check.component.scss',
})
export class SelectionCheckComponent {
  readonly checked = input<boolean>(false);

  /**
   * Selezione parziale: né tutto né niente.
   *
   * ⚠️ Non è un terzo valore di `checked`: è un attributo a sé, e si imposta
   * solo via proprietà — in HTML non esiste. Per questo passa da un binding.
   */
  readonly indeterminate = input<boolean>(false);

  readonly ariaLabel = input.required<string>();

  readonly changed = output<boolean>();
}
