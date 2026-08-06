// Finestre di comunicazione del collegamento POS ↔ strumento di certificazione
// sul portale Fatture e Corrispettivi (Provv. AdE 424470/2025 + FAQ 2026).
// Funzioni pure UTC: il servizio le usa per calcolare scadenza e stato.

/** Ultimo giorno utile della prima finestra (POS già in uso a gennaio 2026). */
const LEGACY_CUTOFF = Date.UTC(2026, 0, 31);
const LEGACY_FROM = Date.UTC(2026, 2, 5);
const LEGACY_TO = Date.UTC(2026, 3, 20);

export interface PortalWindow {
  readonly from: Date;
  readonly to: Date;
}

export type PosPortalStatus = 'linked' | 'upcoming' | 'open' | 'overdue';

/**
 * Finestra di comunicazione per un terminale attivato (o variato) in una data.
 * Regime: dal 6° giorno all'ultimo giorno del SECONDO mese successivo (es.
 * attivato ad aprile → 6–30 giugno). La norma dice «ultimo giorno lavorativo»:
 * qui si usa l'ultimo giorno del mese — il promemoria deve anticipare, non
 * inseguire il calendario festivi. Prima finestra (in uso al 1/1/2026 o
 * attivati entro il 31/1/2026): 5 marzo – 20 aprile 2026.
 */
export function posPortalWindow(activatedAt: Date): PortalWindow {
  const activated = Date.UTC(
    activatedAt.getUTCFullYear(),
    activatedAt.getUTCMonth(),
    activatedAt.getUTCDate(),
  );
  if (activated <= LEGACY_CUTOFF) {
    return { from: new Date(LEGACY_FROM), to: new Date(LEGACY_TO) };
  }
  const year = activatedAt.getUTCFullYear();
  const month = activatedAt.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, month + 2, 6)),
    // Giorno 0 del mese dopo = ultimo giorno del mese della finestra.
    to: new Date(Date.UTC(year, month + 3, 0)),
  };
}

export function posPortalStatus(
  activatedAt: Date,
  portalLinkedAt: Date | null,
  today: Date,
): PosPortalStatus {
  if (portalLinkedAt) {
    return 'linked';
  }
  const { from, to } = posPortalWindow(activatedAt);
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (day < from.getTime()) {
    return 'upcoming';
  }
  return day > to.getTime() ? 'overdue' : 'open';
}
