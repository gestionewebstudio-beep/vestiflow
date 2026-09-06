import { Directive, inject, TemplateRef } from '@angular/core';

/**
 * ⏸ Il **comando di riga** — il menu «···» che alcuni elenchi hanno ancora.
 *
 * ```html
 * <app-data-table rowActionsLabel="Azioni">
 *   <ng-template appRowActions let-doc>
 *     <app-action-menu [items]="rowActions(doc)" />
 *   </ng-template>
 * </app-data-table>
 * ```
 *
 * ⚠️ **È una direttiva a sé e non un `appCell` con un id riservato**, perché non è
 * una colonna: non sta nel modello colonne, non compare nel selettore, non si
 * ordina e non si ridimensiona. Dargli un id fittizio l'avrebbe fatto sembrare un
 * dato, e prima o poi qualcuno avrebbe provato a ordinarci sopra.
 *
 * ⛔ **È transitorio.** `14` §C0.1 ha deciso che le funzioni per singolo documento
 * escono dal menu «···»; finché la matrice azioni non le ha ricollocate, toglierlo
 * sarebbe togliere comandi che non hanno ancora un'altra casa. Quando la matrice è
 * applicata, questa direttiva va rivalutata.
 */
@Directive({
  selector: '[appRowActions]',
})
export class DataTableRowActionsDirective {
  readonly template = inject(TemplateRef);
}
