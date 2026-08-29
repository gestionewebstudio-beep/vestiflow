import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ActionMenuComponent } from '@shared/components/action-menu/action-menu.component';
import type { ActionMenuItem } from '@shared/components/action-menu/action-menu.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';
import { listActionState, listActionTarget } from '@shared/models/list-selection.model';
import type {
  ListAction,
  ListActionItem,
  ListActionState,
  ListActionTarget,
} from '@shared/models/list-selection.model';

/**
 * La **barra azioni di un elenco** (`14` §5).
 *
 * ⛔ **Le azioni sono SEMPRE visibili**, e la selezione non le fa comparire: ne
 * cambia l'ambito. Qui c'era `selection-action-bar`, che si mostrava soltanto
 * con almeno una riga scelta — e a zero selezionati i comandi non si vedevano
 * affatto. Il nome è cambiato con il mestiere.
 *
 * ```text
 * 0 selezionati   [ Stampa ] [ Excel ] [ Esporta ▾ ]        → ambito «filtered»
 * 3 selezionati   3 · Deseleziona
 *                 [ Stampa ] [ Excel ] [ Esporta ▾ ]        → ambito «selection»
 * ```
 *
 * ⚠️ **I comandi non si spostano mai.** Un pulsante che salta da un punto
 * all'altro quando si spunta una casella è peggio di uno che sta fermo: la mano
 * ha già imparato dov'è.
 *
 * ⛔ **Non sa che cosa siano Stampa, Excel o Esporta.** Riceve le azioni che la
 * pagina dichiara, ne calcola lo stato dal contratto comune, e chiama l'handler
 * col bersaglio. Il giorno in cui qui dentro compare un `if (action.id === …)`
 * questo componente smette di essere comune.
 */
@Component({
  selector: 'app-list-actions-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionMenuComponent, ButtonComponent, HoverTooltipComponent],
  templateUrl: './list-actions-bar.component.html',
  styleUrl: './list-actions-bar.component.scss',
})
export class ListActionsBarComponent {
  /**
   * Quante righe sono selezionate: governa ambito e stato delle azioni.
   *
   * ⭐ **Zero di default, e non è pigrizia**: da quando ogni elenco ha la barra
   * in basso (30/08/2026), le pagine senza selezione — che hanno comandi ma non
   * caselle — dovrebbero scrivere `[count]="0" [ids]="[]"` una per una. Il caso
   * comune lo assorbe il componente.
   */
  readonly count = input<number>(0);

  /** Gli ID selezionati. Vuoto = l'ambito è il risultato filtrato. */
  readonly ids = input<readonly string[]>([]);

  readonly actions = input.required<readonly ListAction[]>();

  /**
   * Il conteggio a parole, con l'accordo già fatto: «documento selezionato» /
   * «documenti selezionati».
   *
   * ⚠️ Due input e non uno con la `s` aggiunta: in italiano cambia anche il
   * participio, e il genere non si indovina da una stringa.
   */
  readonly labelSingular = input<string>('elemento selezionato');
  readonly labelPlural = input<string>('elementi selezionati');

  /** Riepilogo facoltativo accanto al conteggio (es. il totale selezionato). */
  readonly summaryLabel = input<string>('');
  readonly summaryValue = input<string>('');

  readonly clearLabel = input<string>('Deseleziona');

  readonly cleared = output<void>();

  protected readonly countLabel = computed(() =>
    this.count() === 1 ? this.labelSingular() : this.labelPlural(),
  );

  /** Lo stato dell'azione: dal contratto comune, non da regole locali. */
  protected stateOf(action: ListAction): ListActionState {
    return listActionState(action, this.count());
  }

  /** Identificativo dell'elemento che descrive un'azione spenta. */
  protected reasonId(action: ListAction): string {
    return `list-action-reason-${action.id}`;
  }

  /** Le voci di menu nel formato che `app-action-menu` si aspetta. */
  protected menuItems(action: ListAction): readonly ActionMenuItem[] {
    return (action.items ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      danger: item.danger,
    }));
  }

  /**
   * ⛔ **La guardia sta qui, non nell'attributo del pulsante.**
   *
   * Con `softDisabled` il pulsante resta focusabile apposta — per poter dire
   * perché non si può — quindi l'attivazione non la impedisce il browser. E un
   * `<button disabled>` nativo non fermerebbe comunque un evento simulato: un
   * test l'ha già scavalcato una volta.
   */
  private eseguibile(action: ListAction): boolean {
    return !this.stateOf(action).disabled;
  }

  /**
   * ⛔ L'ambito lo decide la selezione, non il chiamante: nessuna riga scelta →
   * l'intero risultato dei filtri (`14` §5.3).
   */
  private get bersaglio(): ListActionTarget {
    return listActionTarget(this.ids());
  }

  protected run(action: ListAction): void {
    if (!this.eseguibile(action)) {
      return;
    }
    action.run?.(this.bersaglio);
  }

  protected runItem(action: ListAction, itemId: string): void {
    if (!this.eseguibile(action)) {
      return;
    }
    const item: ListActionItem | undefined = action.items?.find(
      (candidate) => candidate.id === itemId,
    );
    item?.run(this.bersaglio);
  }
}
