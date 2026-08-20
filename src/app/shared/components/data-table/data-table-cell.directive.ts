import { Directive, TemplateRef, inject, input } from '@angular/core';

/**
 * Il template di UNA cella, dichiarato dalla pagina e proiettato nel motore
 * (`14` §H8).
 *
 * ```html
 * <ng-template appCell="status" let-row>
 *   <app-badge [tone]="tone(row)">{{ label(row) }}</app-badge>
 * </ng-template>
 * ```
 *
 * ⛔ **Perché un template e non `cell: (row) => string`.** Una funzione che
 * ritorna testo butterebbe via pill, link, icone e monospace — cioè quasi tutto
 * quello che le celle dei riepiloghi fanno oggi. Il testo semplice resta
 * comodo, e per quello c'è `cellText` sul motore: il template serve dove la
 * cella non è testo.
 *
 * ⚠️ **Non è l'antipattern dei flag.** `regole-architettura` mette in guardia da
 * «8+ `input()` con flag che alterano il template»: un template per colonna è
 * un'altra cosa, ed è ciò che usano le tabelle di PrimeNG e Material.
 */
@Directive({
  selector: '[appCell]',
})
export class DataTableCellDirective {
  /** L'id della colonna che questo template rende. */
  readonly appCell = input.required<string>();

  // REASON: TemplateRef e' generico e il contesto lo tipizza il consumatore.
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}
