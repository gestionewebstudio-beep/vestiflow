import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';
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
  /*
    ⏸ **Non più mostrate: il conteggio lo dice la riga totali.** Restano perché
    undici schermate le passano ancora, e toglierle di colpo sarebbe una
    modifica in undici file per nessun effetto visibile.

    ⛔ Non vanno rimesse in uso: due indicatori dello stesso numero sono il
    difetto che questa rimozione ha chiuso.
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

  // ── ⭐ Sul telefono si riduce il NUMERO dei comandi, non la loro taglia ────

  /*
    ⛔ **La barra sfondava.** Segnalato dal proprietario il 31/08/2026 sui
    Prodotti, con la schermata: «Importa CSV» e «Importa catalogo» a capo dentro
    il pulsante, «Duplica» ed «Elimina» sovrapposti, «Stampa etichette» tagliato
    fuori dallo schermo.

    ⚠️ **Non è un difetto di misure**: sette comandi non stanno in 390px nemmeno
    a padding zero. `regole-stile-ui` lo dice da prima che succedesse — «su mobile
    si riduce il NUMERO dei comandi, non la loro taglia» — e la forma prevista è
    la CTA primaria più un **menu nominato** per il resto.

    ⭐ **La prima azione resta un pulsante, le altre entrano nel menu.** Due
    elementi entrano a qualunque larghezza, e nessun comando sparisce: cambia da
    dove si raggiunge.

    ⚠️ **Sopra `lg` non cambia niente**: `azioniInBarra` restituisce tutto, e le
    dodici pagine che hanno la barra larga non se ne accorgono.
  */
  private readonly compatto = inject(ViewportService).compact;

  protected readonly azioniInBarra = computed<readonly ListAction[]>(() =>
    this.compatto() ? this.actions().slice(0, 1) : this.actions(),
  );

  protected readonly azioniNelMenu = computed<readonly ListAction[]>(() =>
    this.compatto() ? this.actions().slice(1) : [],
  );

  /**
   * Le voci del menu «Altro»: le azioni rimaste, con i sotto-menu **appiattiti**.
   *
   * ⚠️ **Un menu dentro un menu non si apre**, e appiattire è l'unica forma che
   * funziona: le voci di «Esporta» diventano voci di «Altro», col nome del padre
   * davanti perché «CSV» da solo non dice di che cosa.
   */
  protected readonly vociAltro = computed<readonly ActionMenuItem[]>(() =>
    this.azioniNelMenu().flatMap((action) => {
      const stato = this.stateOf(action);
      if (!action.items) {
        return [
          {
            id: action.id,
            label: action.label,
            icon: action.icon,
            danger: action.variant === 'danger',
            disabled: stato.disabled,
            disabledReason: stato.reason ?? undefined,
          },
        ];
      }
      return action.items.map((item) => ({
        id: `${action.id}:${item.id}`,
        label: `${action.label} · ${item.label}`,
        icon: item.icon ?? action.icon,
        danger: item.danger,
        disabled: stato.disabled,
        disabledReason: stato.reason ?? undefined,
      }));
    }),
  );

  /**
   * ⚠️ **L'id composto va sciolto**: una voce di sotto-menu porta
   * `azione:voce`, e va eseguita sull'azione padre col suo item.
   */
  protected eseguiDaAltro(id: string): void {
    const [idAzione, idVoce] = id.split(':');
    const azione = this.azioniNelMenu().find((a) => a.id === idAzione);
    if (!azione) {
      return;
    }
    if (idVoce === undefined) {
      this.run(azione);
      return;
    }
    this.runItem(azione, idVoce);
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
