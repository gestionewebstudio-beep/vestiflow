import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * **Il contratto comune dei filtri di elenco** (`14` §11).
 *
 * ⛔ **Il gap che questo contratto chiude, misurato il 29/08/2026** (`14` §3.3):
 * dieci elenchi dichiaravano **102 controlli filtro**, di cui **42 erano copie**
 * — lo stesso `<app-select-menu>` scritto due volte, una per il desktop e una
 * dentro il pannello mobile, con lo stesso stato e gli stessi handler. Su
 * `document-list` in quattro casi l'etichetta lo dichiarava: «Filtra per
 * cliente» e «Filtra per cliente (pannello filtri)».
 *
 * ⭐ **Un filtro si DICHIARA una volta e si rende due.** Desktop e mobile sono
 * due vesti dello stesso stato: stessi valori, stessi handler, stessi query
 * param, stessa richiesta, stessa policy di azzeramento (`14` §17.3).
 */

/**
 * I tipi che il contratto deve saper rappresentare (`14` §11).
 *
 * ⚠️ Ne sono implementati **quattro**, e nessuno è speculativo: `select`,
 * `date`, `period` e `checkbox` sono i tipi che i consumer usano oggi. Gli
 * altri di §11 restano **dichiarati e non implementati**: aggiungere un ramo
 * senza un consumer che lo eserciti è codice che nessuno prova.
 */
export type ListFilterKind = 'select' | 'date' | 'period' | 'checkbox';

/** Un filtro dichiarato dalla pagina. La veste la decide il contenitore. */
export interface ListFilterDef {
  /** Identità del filtro: è la chiave dello stato e del query param. */
  readonly key: string;
  /**
   * Il nome che l'operatore legge.
   *
   * ⭐ Serve a **entrambe** le vesti, ed è la ragione per cui basta scriverlo
   * una volta: sul desktop diventa l'etichetta del chip, nel pannello mobile la
   * riga sopra il controllo.
   */
  readonly label: string;
  readonly kind: ListFilterKind;
  /** Obbligatorio per `kind: 'select'`. */
  readonly options?: readonly SelectMenuOption[];
  /** Il testo quando non c'è selezione: «Tutti», «Nessuna data»… */
  readonly placeholder?: string;
  /** `select` con molte voci: accende la ricerca dentro la tendina. */
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  /**
   * ⛔ **Conta nel badge «Filtri (n)»?** Predefinito `true`.
   *
   * `14` §19: il badge conta **solo le restrizioni opzionali**. Non contano il
   * Periodo quando la pagina lo classifica come obbligatorio o di default, né
   * Raggruppa, né l'ordinamento, né Colonne — che filtri non sono.
   */
  readonly countsAsActive?: boolean;
  /**
   * ⛔ **`Azzera filtri` lo tocca?** Predefinito `true`.
   *
   * `14` §19: l'azzeramento rimuove i filtri opzionali e ripristina i default;
   * non resetta Colonne né i controlli di presentazione.
   */
  readonly resettable?: boolean;
  /** Il valore a cui `Azzera filtri` riporta questo filtro. Predefinito `''`. */
  readonly defaultValue?: string;

  /**
   * ⭐ **Che cosa fare quando cambia.** Sta nella definizione, non in uno
   * `switch` esterno: chiave e comportamento restano nella stessa riga, e non
   * nasce un secondo elenco delle chiavi che può divergere dal primo.
   *
   * ⚠️ È l'handler che la pagina ha GIÀ: il contenitore lo chiama e basta.
   */
  readonly onChange?: (value: string | null) => void;

  /**
   * ⭐ Solo per `kind: 'checkbox'`: riceve un **booleano**, non una stringa.
   *
   * ⚠️ È un handler separato apposta. Farlo passare da `onChange` costringerebbe
   * a convertire avanti e indietro, e la conversione è il posto dove un
   * `'false'` diventa `true`.
   */
  readonly onCheckedChange?: (checked: boolean) => void;

  // ── Solo per `kind: 'period'` ────────────────────────────────
  //
  // ⭐ **Il Periodo è UN filtro, anche quando mostra due date.** I campi Dal e
  //    Al non sono due filtri indipendenti: si vincolano a vicenda — Dal ha
  //    per massimo Al, Al ha per minimo Dal — e spezzarli perderebbe quel
  //    legame, lasciando scegliere un «Dal» successivo all'«Al».

  /**
   * ⛔ **Mostrare i campi Dal/Al lo decide il CONSUMER**, non il contenitore.
   *
   * Oggi le pagine non concordano, ed è legittimo: `document-list` li mostra
   * sempre tranne che sull'Arrivo merce, dove compaiono solo col preset
   * Personalizzato. Il contenitore comune non deve conoscere l’Arrivo merce:
   * riceve la condizione già risolta e la rende.
   */
  readonly showDateRange?: boolean;
  /** Chiave dello stato per l'estremo iniziale. */
  readonly fromKey?: string;
  /** Chiave dello stato per l'estremo finale. */
  readonly toKey?: string;
  readonly fromLabel?: string;
  readonly toLabel?: string;
  /**
   * ⭐ Tre callback distinte, perché il Periodo è un filtro COMPOSTO: il preset
   * ricalcola l’intervallo, le due date lo restringono a mano. Sono operazioni
   * diverse e chiamano handler diversi — quelli che la pagina ha già.
   */
  readonly onPresetChange?: (value: string | null) => void;
  readonly onFromChange?: (value: string) => void;
  readonly onToChange?: (value: string) => void;
}

/**
 * Lo stato corrente: chiave del filtro → valore.
 *
 * ⚠️ Il booleano è nell'unione perché `kind: 'checkbox'` **è** un booleano:
 * forzarlo dentro `string | null` lo trasformerebbe in una stringa da
 * confrontare, ed è il genere di conversione che poi qualcuno sbaglia con un
 * `'false'` che vale `true`.
 */
export type ListFilterValues = Readonly<
  Record<string, string | boolean | null | undefined>
>;

/** Una modifica, dalla veste allo stato della pagina. */
export interface ListFilterChange {
  readonly key: string;
  readonly value: string | null;
}

/**
 * Il valore corrente di un filtro, normalizzato a stringa.
 *
 * ⚠️ Un `kind: 'checkbox'` non passa di qui: ha il suo accessorio tipizzato.
 */
export function listFilterValue(values: ListFilterValues, key: string): string {
  const v = values[key];
  return typeof v === 'string' ? v : '';
}

/** Lo stato di una spunta. Assente o non booleano = non spuntata. */
export function listFilterChecked(values: ListFilterValues, key: string): boolean {
  return values[key] === true;
}

/**
 * Il filtro è **attivo**, cioè restringe il risultato?
 *
 * ⚠️ Attivo non vuol dire «valorizzato»: un filtro riportato al proprio
 * `defaultValue` non restringe niente, e contarlo direbbe all'operatore che c'è
 * una restrizione dove non c'è.
 */
export function isListFilterActive(filtro: ListFilterDef, values: ListFilterValues): boolean {
  if (filtro.countsAsActive === false) {
    return false;
  }
  if (filtro.kind === 'checkbox') {
    // Una spunta restringe solo quando è spuntata: «non spuntata» è il default,
    // e non è una restrizione.
    return listFilterChecked(values, filtro.key);
  }
  const corrente = listFilterValue(values, filtro.key);
  return corrente !== '' && corrente !== (filtro.defaultValue ?? '');
}

/** Quante restrizioni opzionali sono attive: è il numero del badge «Filtri (n)». */
export function countActiveListFilters(
  filtri: readonly ListFilterDef[],
  values: ListFilterValues,
): number {
  return filtri.filter((filtro) => isListFilterActive(filtro, values)).length;
}

/**
 * ⛔ **L’azzeramento resta del CONSUMER, e non è una rinuncia.**
 *
 * `14` §19 dice cosa deve fare — rimuovere i filtri opzionali, ripristinare i
 * default, non toccare le Colonne — ma il come dipende dalla pagina, e la
 * misura del 29/08/2026 lo dimostra: `document-list.resetFilters()` sceglie il
 * preset **in base al profilo** (Arrivo merce torna a «Mese corrente», gli altri
 * a «Tutti») e poi ricalcola le date con `resolveMovementPeriodRange`.
 *
 * ⚠️ Un azzeramento calcolato qui dovrebbe conoscere i profili documentali e
 * l’aritmetica dei periodi: due cose che il contenitore comune non deve sapere.
 * Il contenitore rende il pulsante ed emette la richiesta; la pagina la esegue.
 */
