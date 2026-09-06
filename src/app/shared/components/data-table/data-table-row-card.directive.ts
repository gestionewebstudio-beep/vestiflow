import { Directive, inject, TemplateRef } from '@angular/core';

/**
 * ⭐ La **veste compatta di una riga**: come si legge sotto `lg`, dove la tabella
 * non ci sta.
 *
 * ```html
 * <app-data-table>
 *   <ng-template appRowCard let-row>
 *     …la card, progettata dalla feature…
 *   </ng-template>
 * </app-data-table>
 * ```
 *
 * ⛔ **Il motore fornisce il MECCANISMO, non il contenuto.** Che cosa mostra una
 * card e in che ordine è una decisione della schermata: un registro fiscale
 * mette in alto data e numero, un elenco prodotti la miniatura. Il motore sa
 * solo *quando* mostrarla e *come* dividere i ruoli con le celle vere.
 *
 * ⚠️ **La divisione dei ruoli è la parte che non si può sbagliare**, ed è
 * invisibile a chi guarda:
 *
 * - la **card** è una veste → porta `aria-hidden`, e non viene annunciata;
 * - le **celle vere** sono i dati → sotto `lg` si nascondono all'occhio con la
 *   ricetta `.sr-only` (`clip-path`), **mai** con `display: none`, che le
 *   toglierebbe anche all'albero accessibile.
 *
 * Senza questa divisione uno screen reader annuncerebbe ogni riga **due volte**.
 *
 * ⏸ Quando una schermata non la fornisce, resta il ripiego a card del mixin
 * condiviso — quello per etichetta:valore. Per i **riepiloghi** il riferimento è
 * il Registro Corrispettivi (`regole-stile-ui` §6, «la card di un elenco si
 * progetta, non si impila»): quel ripiego, con otto colonne, dà otto righe tutte
 * dello stesso peso in cui niente è primario.
 */
@Directive({
  selector: '[appRowCard]',
})
export class DataTableRowCardDirective {
  readonly template = inject(TemplateRef);
}
