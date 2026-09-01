import type { TableColumnFilterKind } from './table-column.model';

/**
 * ⭐ **LO STATO DI UN FILTRO DI COLONNA** (`14` §0.2).
 *
 * I filtri di un elenco **sono le sue colonne**: il controllo vive
 * nell'intestazione su scrivania e come voce del pannello sotto `lg`. Restano
 * fuori solo Periodo e Ricerca, che non appartengono a una colonna sola.
 *
 * ## Tre forme, e la forma la deduce la colonna
 *
 * ```text
 * values   un insieme chiuso — stato, tipo, sede: si sceglie fra i valori presenti
 * text     alta cardinalità — SKU, riferimenti, nomi: si scrive un pezzo
 * range    numeri e date — importi, quantità: si dà un minimo e un massimo
 * ```
 *
 * ⚠️ **Il valore vuoto è «nessun filtro», non «valore vuoto»**: un `values` con
 * l'insieme vuoto non restringe niente, e un `range` senza estremi nemmeno.
 * Confonderli renderebbe impossibile togliere un filtro.
 */
export interface ColumnFilterValue {
  readonly kind: TableColumnFilterKind;
  /** `values`: gli elementi scelti. Vuoto = nessuna restrizione. */
  readonly values?: readonly string[];
  /**
   * ⭐ **`values`: la scelta è un'ESCLUSIONE** — «tutte le righe tranne queste».
   * Chiesto dal proprietario col modello Danea: «fare in modo di riuscire a fare
   * qualche filtro dove posso selezionare più cose, escludere ecc.».
   *
   * ⚠️ **Non è un quinto tipo di filtro, è un verso.** Un `kind` a parte
   * avrebbe raddoppiato ogni ramo — la raccolta dei valori distinti, il
   * conteggio del badge, la resa del controllo — per una differenza che è un
   * `!` nel confronto.
   *
   * ⛔ **Con l'insieme VUOTO non restringe, in nessuno dei due versi**: «escludi
   * niente» è l'elenco intero, non l'elenco vuoto. È la stessa regola del vuoto
   * qui sopra, ed è ciò che rende sempre possibile togliere il filtro.
   */
  readonly exclude?: boolean;
  /** `text`: il pezzo da cercare. Vuoto = nessuna restrizione. */
  readonly text?: string;
  /** `range`: gli estremi, entrambi facoltativi. */
  readonly min?: number;
  readonly max?: number;
  /**
   * `date`: gli estremi in ISO `AAAA-MM-GG`, entrambi facoltativi.
   *
   * ⚠️ **ISO e non il testo mostrato**: `31/01` viene prima di `01/02` solo
   * confrontando le date, e in ISO il confronto fra stringhe è già quello giusto.
   */
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

/** Lo stato di tutti i filtri di colonna: `columnId` → valore. */
export type ColumnFilterState = Readonly<Record<string, ColumnFilterValue>>;

/** Un filtro cambiato: la pagina lo riceve e aggiorna il proprio stato. */
export interface ColumnFilterChange {
  readonly columnId: string;
  /** `null` toglie il filtro da questa colonna. */
  readonly value: ColumnFilterValue | null;
}

/**
 * Il filtro RESTRINGE davvero qualcosa?
 *
 * ⚠️ **Serve al conteggio del badge «Filtri (n)»**, che per regola conta solo le
 * restrizioni attive: un controllo aperto e lasciato vuoto non è un filtro.
 */
export function isColumnFilterActive(value: ColumnFilterValue | undefined): boolean {
  if (!value) {
    return false;
  }
  /*
    ⛔ **Qui c'era uno `switch (kind)`, e con le restrizioni che convivono era
    diventato cieco a metà**: su una colonna `date` avrebbe ignorato le spunte,
    su una `values` gli estremi — cioè il badge «Filtri (n)» non avrebbe contato
    proprio i filtri nuovi.
  */
  return (
    (value.values?.length ?? 0) > 0 ||
    (value.text?.trim().length ?? 0) > 0 ||
    value.min !== undefined ||
    value.max !== undefined ||
    value.dateFrom !== undefined ||
    value.dateTo !== undefined
  );
}

/** Quanti filtri di colonna restringono: è il numero del badge. */
export function countActiveColumnFilters(state: ColumnFilterState): number {
  return Object.values(state).filter(isColumnFilterActive).length;
}

/**
 * ⭐ **Applica i filtri di colonna a un insieme di righe.**
 *
 * ⚠️ **Filtra ciò che è già CARICATO, ed è corretto qui**: gli elenchi di
 * VestiFlow chiedono `all=1` — verificato su tutti e sette il 31/08/2026 — quindi
 * l'insieme in mano **è** il risultato del filtro di periodo e ricerca. Su un
 * elenco paginato questo sarebbe il difetto che il motore evita per
 * l'ordinamento: filtrare una pagina e chiamarla il risultato.
 *
 * ⛔ **Il confronto usa `cellText`, cioè ciò che l'operatore LEGGE.** Non il
 * valore grezzo: chi filtra «Confermato» sta scegliendo la parola che vede in
 * tabella, e un filtro che confrontasse l'enum `confirmed` mostrerebbe scelte
 * che nella colonna non compaiono.
 *
 * ⚠️ **`range` invece legge il NUMERO**, e non può fare altrimenti: `1.234,50 €`
 * è una stringa, e confrontarla come tale metterebbe «−5» dopo «10». Chi
 * dichiara una colonna `range` fornisce l'estrattore.
 */
export function applicaFiltriDiColonna<T>(
  righe: readonly T[],
  filtri: ColumnFilterState,
  opzioni: {
    readonly cellText: (row: T, columnId: string) => string;
    /** Il numero di una colonna `range`. Senza, la colonna non filtra. */
    readonly numeroDi?: (row: T, columnId: string) => number | null;
    /**
     * La data ISO (`AAAA-MM-GG`) di una colonna `date`. Senza, non filtra.
     *
     * ⚠️ **Un istante completo va troncato al giorno**: `2026-08-31T14:00Z`
     * confrontato con un estremo `2026-08-31` risulterebbe **maggiore**, e la
     * riga di oggi sparirebbe da un filtro «fino a oggi».
     */
    readonly dataDi?: (row: T, columnId: string) => string | null;
  },
): readonly T[] {
  const attivi = Object.entries(filtri).filter(([, v]) => isColumnFilterActive(v));
  if (attivi.length === 0) {
    return righe;
  }

  return righe.filter((riga) =>
    attivi.every(([columnId, filtro]) => passa(riga, columnId, filtro)),
  );

  /**
   * ⭐ **IL TIPO DICE COME SI COMPILA, IL VALORE DICE COME RESTRINGE** — deciso
   * il 01/09/2026 col riferimento Danea alla mano.
   *
   * ⛔ **Qui c'era uno `switch (filtro.kind)`**, cioè: una colonna «data» sa
   * restringere SOLO per intervallo, una colonna «testo» SOLO per contenuto. È
   * la ragione per cui in Danea si può spuntare `02/01/2026` fra le date e da
   * noi no — e per cui l'operatore trovava «alcuni filtri che funzionano in un
   * modo ed altri in un altro, e non ha senso».
   *
   * ⭐ **Ora le restrizioni convivono nello stesso valore**, e si applicano
   * tutte quelle presenti: le spunte, il contenuto scritto, gli estremi.
   * Il `kind` resta, ma dice soltanto **che cosa il pannello offre** — le
   * scorciatoie di periodo su una data, gli estremi su un numero.
   */
  function passa(riga: T, columnId: string, filtro: ColumnFilterValue): boolean {
    // ⭐ Le spunte: stesso confronto in entrambi i versi, negato se si esclude.
    const scelti = filtro.values ?? [];
    if (scelti.length > 0) {
      const dentro = scelti.includes(opzioni.cellText(riga, columnId));
      if (filtro.exclude ? dentro : !dentro) {
        return false;
      }
    }

    // ⭐ Il testo scritto: restringe da solo, senza dover spuntare niente.
    const cercato = (filtro.text ?? '').trim().toLocaleLowerCase('it');
    if (cercato.length > 0) {
      const testo = opzioni.cellText(riga, columnId).toLocaleLowerCase('it');
      if (!testo.includes(cercato)) {
        return false;
      }
    }

    if (filtro.min !== undefined || filtro.max !== undefined) {
      const numero = opzioni.numeroDi?.(riga, columnId) ?? null;
      // ⚠️ Senza estrattore la colonna non filtra: meglio non restringere che
      //    restringere per un confronto che non sappiamo fare.
      if (numero !== null) {
        if (filtro.min !== undefined && numero < filtro.min) {
          return false;
        }
        if (filtro.max !== undefined && numero > filtro.max) {
          return false;
        }
      }
    }

    if (filtro.dateFrom !== undefined || filtro.dateTo !== undefined) {
      const iso = opzioni.dataDi?.(riga, columnId) ?? null;
      if (iso !== null) {
        // ⚠️ Al GIORNO: un istante completo confrontato con «fino al 31/08»
        //    risulterebbe maggiore, e la riga di oggi sparirebbe.
        const giorno = iso.slice(0, 10);
        if (filtro.dateFrom !== undefined && giorno < filtro.dateFrom) {
          return false;
        }
        if (filtro.dateTo !== undefined && giorno > filtro.dateTo) {
          return false;
        }
      }
    }

    return true;
  }
}

/**
 * ⭐ **I valori distinti di una colonna**, per il controllo `values`.
 *
 * ⚠️ **Si leggono dalle righe CARICATE**, non da un elenco dichiarato: così le
 * scelte sono esattamente quelle che compaiono in tabella, e non ce n'è una che
 * non dà risultati.
 *
 * ⚠️ **Ordinati come li legge un italiano** (`localeCompare` con `it`): «Àncona»
 * viene prima di «Bari», e non dopo «Zurigo» come farebbe un confronto binario.
 */
export function valoriDistinti<T>(
  righe: readonly T[],
  columnId: string,
  cellText: (row: T, columnId: string) => string,
): readonly string[] {
  const visti = new Set<string>();
  for (const riga of righe) {
    const testo = cellText(riga, columnId).trim();
    if (testo.length > 0) {
      visti.add(testo);
    }
  }
  const valori = [...visti];

  /*
    ⭐ **LE DATE SI ORDINANO COME DATE, E DALLA PIÙ RECENTE** — proprietario,
    01/09/2026: «le date sono in ordine decrescente», guardando un elenco che
    le mostra decrescenti e un filtro che le offriva crescenti.

    ⛔ **E l'ordine alfabetico su `GG/MM/AAAA` è proprio sbagliato**, non solo
    invertito: «29/08/2026» e «07/09/2026» si confrontano dal primo carattere,
    quindi settembre finisce prima di agosto. Con `localeCompare` l'elenco delle
    date era mescolato, e nessuno se ne accorgeva finché i mesi erano uno solo.

    ⚠️ **Si riconosce dalla FORMA, non dal tipo di colonna**: `valoriDistinti`
    riceve testo, non sa che colonna sia. Se ogni valore è una data italiana
    completa, allora è un elenco di date.
  */
  if (valori.length > 0 && valori.every((v) => DATA_ITALIANA.test(v))) {
    return valori.sort((a, b) => aIso(b).localeCompare(aIso(a)));
  }

  /*
    ⚠️ **Ordinati come li legge un italiano** (`localeCompare` con `it`):
    «Àncona» viene prima di «Bari», e non dopo «Zurigo» come farebbe un
    confronto binario.
  */
  return valori.sort((a, b) => a.localeCompare(b, 'it'));
}

const DATA_ITALIANA = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** `GG/MM/AAAA` → `AAAA-MM-GG`, l'unica forma in cui il confronto fra stringhe è giusto. */
function aIso(valore: string): string {
  const m = DATA_ITALIANA.exec(valore);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : valore;
}
