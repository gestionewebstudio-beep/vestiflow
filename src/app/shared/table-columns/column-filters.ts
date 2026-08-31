import { computed, effect, inject } from '@angular/core';
import type { Signal } from '@angular/core';

import { applicaFiltriDiColonna, valoriDistinti } from './column-filter.model';
import { ColumnFilterStore } from './column-filter.store';
import type { TableViewId } from './table-column.model';

/**
 * ⭐ **I filtri di colonna, dal lato di chi possiede le righe** (`14` §0.2).
 *
 * Una tabella dumb chiama questo una volta e riceve le righe già ristrette: da
 * lì derivano sezioni, riga totali e card, senza che nessuna delle tre sappia
 * che esiste un filtro.
 *
 * ```ts
 * protected readonly righe = createColumnFilters({
 *   viewId: this.viewId,
 *   righe: this.suppliers,
 *   cellText: this.cellText,
 * });
 * ```
 *
 * ## Fa DUE cose, e la seconda è quella che si dimentica
 *
 * 1. **restringe** le righe secondo lo stato della vista;
 * 2. **registra le scelte** offerte dai filtri `values` — e le legge dalle righe
 *    NON filtrate.
 *
 * ⛔ **Il punto 2 letto dalle righe già ristrette è il difetto classico**: scelto
 * «Bozza», «Confermato» sparirebbe dall'elenco delle scelte, e il filtro si
 * potrebbe stringere ma mai allargare. È la ragione per cui la registrazione sta
 * qui — dove le righe intere ci sono — e non nel motore, che riceve solo quelle
 * da disegnare.
 *
 * ⚠️ **Va chiamato in contesto di iniezione** (inizializzatore di campo o
 * costruttore): usa `inject` ed `effect`.
 */
export function createColumnFilters<T>(opzioni: {
  /** La vista: la stessa chiave delle preferenze colonne. */
  readonly viewId: () => TableViewId | undefined;
  readonly righe: () => readonly T[];
  /** Come si legge il testo di una cella — lo stesso che riceve il motore. */
  readonly cellText: (row: T, columnId: string) => string;
  /**
   * Il numero di una colonna `range`.
   *
   * ⚠️ **Senza, le colonne `range` non filtrano** invece di filtrare male: un
   * confronto fatto sul testo formattato metterebbe «−5,00 €» dopo «10,00 €».
   */
  readonly numeroDi?: (row: T, columnId: string) => number | null;
  /**
   * La data ISO di una colonna `date`.
   *
   * ⚠️ **Senza, le colonne `date` non filtrano**, per la stessa ragione di
   * `numeroDi`: il testo mostrato è `31/08/2026`, e confrontarlo come stringa
   * metterebbe gennaio dopo dicembre.
   */
  readonly dataDi?: (row: T, columnId: string) => string | null;
}): Signal<readonly T[]> {
  const store = inject(ColumnFilterStore);

  /*
    ⚠️ **La registrazione è un effetto perché `viewId` è un `input()`**: non
    esiste ancora quando il campo si inizializza. L'effetto riparte se la vista
    cambia — non succede oggi, e il giorno che succedesse sarebbe l'unico
    comportamento corretto.
  */
  effect(() => {
    const vista = opzioni.viewId();
    if (vista === undefined) {
      return;
    }
    store.registraOpzioni(vista, (columnId) =>
      valoriDistinti(opzioni.righe(), columnId, opzioni.cellText),
    );
  });

  return computed(() => {
    const vista = opzioni.viewId();
    if (vista === undefined) {
      return opzioni.righe();
    }
    return applicaFiltriDiColonna(opzioni.righe(), store.stato(vista)(), {
      cellText: opzioni.cellText,
      ...(opzioni.numeroDi ? { numeroDi: opzioni.numeroDi } : {}),
      ...(opzioni.dataDi ? { dataDi: opzioni.dataDi } : {}),
    });
  });
}
