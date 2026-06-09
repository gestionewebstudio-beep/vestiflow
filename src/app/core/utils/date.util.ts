// Helper puri di formattazione date (display it-IT). Centralizzati per evitare
// formati divergenti tra le feature; con l'i18n reale passeranno da LOCALE_ID.

import type { IsoDateString } from '../models/common.model';

const DATE_FORMAT = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Data leggibile (es. '9 giu 2026'). */
export function formatDate(iso: IsoDateString): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** Data e ora leggibili (es. '9 giu 2026, 14:30'). */
export function formatDateTime(iso: IsoDateString): string {
  return DATE_TIME_FORMAT.format(new Date(iso));
}
