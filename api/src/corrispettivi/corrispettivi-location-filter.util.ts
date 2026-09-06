import type { CorrispettiviListFilters } from './corrispettivi-query.util';

/**
 * ⛔ IL REGISTRO NON SI FILTRA PER SEDE AUTORIZZATA — deciso il 02/09/2026.
 *
 * > Il Registro raggruppa TUTTI i corrispettivi dell'azienda. Al commercialista
 * > va inviato tutto: non può vedere dati parziali, soprattutto a sua insaputa.
 *
 * L'accesso al Registro è **binario**: lo si vede intero, o non lo si vede. Lo
 * governa il permesso sulla rotta, non un insieme di sedi.
 *
 * ⚠️ Il 02/09/2026 era stato introdotto qui uno scope per sede, dedotto dal
 * fatto che il vecchio export dai movimenti lo applicava. Era **inventato**:
 * nessuna regola l'aveva mai deciso, e `docs/10` §14 parla di sedi autorizzate
 * solo per la TENDINA del filtro — «di quali sedi posso consultare?» — non per
 * le righe. L'effetto sarebbe stato un corrispettivo totale più basso del vero,
 * senza nessun segnale: in un registro fiscale è il difetto peggiore possibile,
 * e lo stesso `docs/10` lo dice.
 *
 * Resta qui la sola cosa che serviva davvero: la NORMALIZZAZIONE dei due
 * contratti di filtro.
 */

/**
 * Collassa `locationId` e `sedi[]` — i due contratti storici della stessa
 * domanda — in un solo campo, `sediEffettive`.
 *
 * ⛔ Dopo questa funzione i due originali non si leggono più: finché
 * convivevano a valle, ogni builder poteva sceglierne uno. È ciò che era
 * successo al **Corrispettivo manuale**, che leggeva il singolare mentre la
 * schermata manda solo il plurale: scegliendo una sede entravano nel Registro,
 * nei totali e in tutti e tre gli export **tutti i corrispettivi manuali del
 * tenant**, di qualunque sede.
 *
 * ⭐ `null` significa «nessun filtro»: dentro anche le righe che una sede non
 * ce l'hanno. Un insieme di id significa «solo quelle sedi», ed è una scelta
 * dell'OPERATORE — mai un'autorizzazione.
 */
export function normalizzaFiltroSedi<T extends CorrispettiviListFilters>(
  query: T,
): FiltriConSediRisolte<T> {
  /*
    ⛔ IDEMPOTENTE: `listOrders` normalizza e poi chiama `buildRegisterRows`,
    che normalizza a sua volta. Alla seconda passata i due contratti originali
    sono già stati consumati, quindi senza questa guardia il filtro scelto
    dall'operatore sparirebbe.
  */
  if (query.sediEffettive !== undefined) {
    return query as FiltriConSediRisolte<T>;
  }

  const chieste = sediChieste(query);
  return {
    ...query,
    locationId: undefined,
    sedi: undefined,
    sediEffettive: chieste === null ? null : [...chieste],
  };
}

/**
 * Un filtro che è PASSATO dalla normalizzazione, e lo dichiara nel tipo: chi
 * riceve questo tipo sa di leggere un filtro con un solo contratto, e chi gli
 * passasse la query grezza non compila.
 */
export type FiltriConSediRisolte<T> = T & {
  readonly sediEffettive: readonly string[] | null;
};

/**
 * Le sedi che la richiesta chiede, nei due contratti storici.
 * `null` = nessuna richiesta (non «nessuna sede»).
 */
function sediChieste(query: CorrispettiviListFilters): readonly string[] | null {
  if (query.sedi && query.sedi.length > 0) {
    return query.sedi;
  }
  return query.locationId ? [query.locationId] : null;
}
