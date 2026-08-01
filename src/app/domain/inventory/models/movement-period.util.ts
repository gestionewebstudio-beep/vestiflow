/** Preset periodo del registro movimenti ('' = tutti, senza vincolo date). */
export const MovementPeriodPreset = {
  All: '',
  ThisMonth: 'month',
  LastMonth: 'last_month',
  ThisYear: 'year',
  LastYear: 'last_year',
  Custom: 'custom',
} as const;

export type MovementPeriodPreset = (typeof MovementPeriodPreset)[keyof typeof MovementPeriodPreset];

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

  switch (preset) {
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
