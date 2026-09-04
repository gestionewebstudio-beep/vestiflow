/**
 * Preset periodo del registro movimenti ('' = tutti, senza vincolo date).
 *
 * ⭐ «Ultimi N giorni» include OGGI: 7 giorni sono oggi e i sei precedenti, 30
 * sono oggi e i ventinove precedenti. È la stessa aritmetica del Registro
 * Corrispettivi, e l’operatore che passa da una schermata all’altra deve
 * trovare lo stesso significato dietro la stessa etichetta.
 *
 * ⚠️ `All` resta nell’unione: la usano l’elenco documenti e l’elenco ordini
 * cliente, e nei Movimenti resta scegliibile: quello che cambia è che non è più
 * il predefinito.
 */
export const MovementPeriodPreset = {
  All: '',
  Last7Days: '7d',
  Last30Days: '30d',
  ThisMonth: 'month',
  LastMonth: 'last_month',
  ThisYear: 'year',
  LastYear: 'last_year',
  Custom: 'custom',
} as const;

export type MovementPeriodPreset = (typeof MovementPeriodPreset)[keyof typeof MovementPeriodPreset];

/**
 * Il periodo con cui il registro movimenti si apre.
 *
 * ⛔ Non è `All`: un registro che si apre su tutta la storia del tenant chiede al
 * database di contare tutto prima ancora che l’operatore abbia guardato qualcosa.
 */
export const DEFAULT_MOVEMENT_PERIOD: MovementPeriodPreset = MovementPeriodPreset.Last30Days;

/**
 * Le voci del selettore Periodo, **in un posto solo**.
 *
 * ⛔ Erano dichiarate identiche in due elenchi — `document-list` e
 * `sales-order-list` — voce per voce, e la misura del 29/08/2026 le ha trovate
 * uguali (`14` §3.2). Due copie della stessa lista sono due posti in cui
 * aggiungere un preset, e uno solo in cui dimenticarselo.
 *
 * ⚠️ Qui sta la **presentazione**, non la semantica: le etichette e l'ordine.
 * Il calcolo delle date resta in `resolveMovementPeriodRange`, i valori
 * persistiti restano quelli dell'enum, e nessuno dei due cambia.
 */
export const MOVEMENT_PERIOD_OPTIONS: readonly { readonly value: string; readonly label: string }[] =
  [
    // ⭐ «Tutti» resta scegliibile ma NON è il predefinito (`14` §H14-bis): un
    //    elenco che si apre su tutta la storia del tenant chiede al database di
    //    leggerla prima ancora che l'operatore abbia guardato qualcosa.
    { value: MovementPeriodPreset.All, label: 'Tutti' },
    { value: MovementPeriodPreset.Last7Days, label: 'Ultimi 7 giorni' },
    { value: MovementPeriodPreset.Last30Days, label: 'Ultimi 30 giorni' },
    { value: MovementPeriodPreset.ThisMonth, label: 'Mese corrente' },
    { value: MovementPeriodPreset.LastMonth, label: 'Mese scorso' },
    { value: MovementPeriodPreset.ThisYear, label: 'Anno corrente' },
    { value: MovementPeriodPreset.LastYear, label: 'Anno scorso' },
    { value: MovementPeriodPreset.Custom, label: 'Personalizzato' },
  ];

/** Estremi inclusivi YYYY-MM-DD (ora locale); assenti = nessun vincolo. */
export interface MovementDateRange {
  readonly from?: string;
  readonly to?: string;
}

/**
 * Converte il preset (o l'intervallo custom Dal/Al) in estremi data locali.
 * I mesi/anni sono di calendario: «Mese corrente» copre tutto il mese, non
 * solo fino a oggi, così il filtro resta stabile durante la giornata.
 */
export function resolveMovementPeriodRange(
  preset: MovementPeriodPreset,
  customFrom: string,
  customTo: string,
  referenceDate: Date = new Date(),
): MovementDateRange {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const day = referenceDate.getDate();

  switch (preset) {
    case MovementPeriodPreset.Last7Days:
      return { from: toIsoDate(year, month, day - 6), to: toIsoDate(year, month, day) };
    case MovementPeriodPreset.Last30Days:
      return { from: toIsoDate(year, month, day - 29), to: toIsoDate(year, month, day) };
    case MovementPeriodPreset.ThisMonth:
      return { from: toIsoDate(year, month, 1), to: toIsoDate(year, month + 1, 0) };
    case MovementPeriodPreset.LastMonth:
      return { from: toIsoDate(year, month - 1, 1), to: toIsoDate(year, month, 0) };
    case MovementPeriodPreset.ThisYear:
      return { from: toIsoDate(year, 0, 1), to: toIsoDate(year, 11, 31) };
    case MovementPeriodPreset.LastYear:
      return { from: toIsoDate(year - 1, 0, 1), to: toIsoDate(year - 1, 11, 31) };
    case MovementPeriodPreset.Custom:
      return { from: customFrom || undefined, to: customTo || undefined };
    default:
      return {};
  }
}

/** YYYY-MM-DD in ora locale (day 0 = ultimo giorno del mese precedente). */
function toIsoDate(year: number, month: number, day: number): string {
  const date = new Date(year, month, day);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}
