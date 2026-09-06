// Helper puri di formattazione date (display it-IT). Centralizzati per evitare
// formati divergenti tra le feature; con l'i18n reale passeranno da LOCALE_ID.

import type { IsoDateString } from '../models/common.model';

/*
  ⭐ **LE DATE SI SCRIVONO IN NUMERI, `GG/MM/AAAA`** — proprietario, 01/09/2026:
  «avere un formato data col testo e non col numero non ci permette di inserire
  una data manualmente, per esempio 01/09/2026 ed effettuare un filtro, è anche
  incoerente con le date presenti nei documenti».

  ⛔ **Qui c'era `dateStyle: 'medium'`, cioè «11 ago 2026».** Due difetti, e il
  secondo è quello che pesa:

  ```text
  elenchi     11 ago 2026     ⛔ Intl 'medium'
  documenti   11/08/2026      ✅ formatItalianInputDate
  ```

  La stessa data scritta in due modi nella stessa applicazione, e quello degli
  elenchi non è nemmeno il formato che i loro filtri accettano in digitazione —
  che è `GG/MM/AAAA` (`parseItalianDateInput`). Chi leggeva «11 ago 2026» non
  aveva modo di sapere che nel filtro doveva scrivere `11/08/2026`.

  ⚠️ **Due cifre anche per giorno e mese**, non `numeric`: incolonnate in una
  tabella le date si confrontano a colpo d'occhio solo se hanno tutte la stessa
  larghezza — è la stessa ragione dei `tabular-nums` sui numeri.
*/
const DATE_FORMAT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
/*
  ⚠️ **Le opzioni singole non si mescolano con `timeStyle`**: `Intl` risponde
  «Invalid option», quindi anche l'ora si dichiara campo per campo.
*/
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
/*
  ⚠️ **La compatta resta senza anno** — è il badge della topbar, dove l'anno
  corrente è sottinteso — ma passa ai numeri come le altre due: «11/08, 14:30».
*/
const DATE_TIME_SHORT_FORMAT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Data leggibile (es. '09/06/2026'). */
export function formatDate(iso: IsoDateString): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** Data e ora leggibili (es. '09/06/2026, 14:30'). */
export function formatDateTime(iso: IsoDateString): string {
  return DATE_TIME_FORMAT.format(new Date(iso));
}

/** Data e ora compatta per topbar e badge (es. '09/06, 14:30'). */
export function formatDateTimeShort(iso: IsoDateString): string {
  return DATE_TIME_SHORT_FORMAT.format(new Date(iso));
}
