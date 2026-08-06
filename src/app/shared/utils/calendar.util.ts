const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarDayCell {
  readonly iso: string;
  readonly dayOfMonth: number;
  readonly inCurrentMonth: boolean;
  readonly isToday: boolean;
  readonly isSelected: boolean;
}

/** Converte una data locale in ISO `YYYY-MM-DD`. */
export function toIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Interpreta ISO `YYYY-MM-DD` come mezzanotte locale. */
export function parseIsoDateLocal(iso: string): Date | null {
  const match = ISO_DATE.exec(iso.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

const ITALIAN_INPUT_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;

/**
 * Interpreta una data digitata in formato italiano (`GG/MM/AAAA`, anche
 * `G/M/AAAA` o separatori `.`/`-`) e la normalizza in ISO `YYYY-MM-DD`.
 * Ritorna null per date incomplete o inesistenti (es. 31/02/2026).
 */
export function parseItalianDateInput(text: string): string | null {
  const match = ITALIAN_INPUT_DATE.exec(text.trim());
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = match[3] ?? '';
  const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return toIsoDateLocal(date);
}

/** Formato compatto it-IT per il trigger (es. 24/06/2026). */
export function formatItalianInputDate(iso: string): string {
  const date = parseIsoDateLocal(iso);
  if (!date) {
    return '';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

const MONTH_NAMES_IT = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const;

export function formatCalendarMonthLabel(year: number, monthIndex: number): string {
  const monthName = MONTH_NAMES_IT[monthIndex] ?? '';
  return `${monthName} ${year}`;
}

export const CALENDAR_WEEKDAY_LABELS_IT = ['lu', 'ma', 'me', 'gi', 've', 'sa', 'do'] as const;

/** Griglia mese con settimana che inizia lunedì. */
export function buildCalendarMonthGrid(
  year: number,
  monthIndex: number,
  selectedIso = '',
  today = new Date(),
): readonly CalendarDayCell[] {
  const todayIso = toIsoDateLocal(today);
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );
    const iso = toIsoDateLocal(date);

    return {
      iso,
      dayOfMonth: date.getDate(),
      inCurrentMonth: date.getMonth() === monthIndex,
      isToday: iso === todayIso,
      isSelected: iso === selectedIso,
    };
  });
}

export function clampIsoDate(iso: string, minIso?: string, maxIso?: string): string {
  if (!iso) {
    return '';
  }

  if (minIso && iso < minIso) {
    return minIso;
  }

  if (maxIso && iso > maxIso) {
    return maxIso;
  }

  return iso;
}

export function viewMonthFromIso(
  iso: string,
  fallback = new Date(),
): { readonly year: number; readonly monthIndex: number } {
  const parsed = parseIsoDateLocal(iso);
  const date = parsed ?? fallback;
  return { year: date.getFullYear(), monthIndex: date.getMonth() };
}
