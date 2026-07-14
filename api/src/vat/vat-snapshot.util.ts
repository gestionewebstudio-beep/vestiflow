import type { Prisma } from '@prisma/client';

import type { VatCodeWithNature } from './vat-codes.service';

/**
 * Snapshot JSON per righe/voci che congelano il Codice IVA al salvataggio
 * (§9): stessa forma di `VatCodesService.buildSnapshot`, estratta qui come
 * funzione pura così da essere riusabile senza iniettare il servizio nei
 * domini che scrivono righe (documenti generici, vendite online, corrispettivi).
 */
export function buildVatCodeSnapshot(vatCode: VatCodeWithNature): Prisma.InputJsonObject {
  return {
    code: vatCode.code,
    natureKey: vatCode.nature.key,
    natureLabel: vatCode.nature.label,
    officialCode: vatCode.nature.officialCode,
    ratePercent: Number(vatCode.ratePercent),
    description: vatCode.description,
    notes: vatCode.notes,
    nonDeductiblePercent: Number(vatCode.nonDeductiblePercent),
    calculationMode: vatCode.calculationMode,
    vatAffectsSupplierTotal: vatCode.vatAffectsSupplierTotal,
  };
}

/**
 * Snapshot IVA "grezzo" per righe dove l'aliquota è un dato osservato (es.
 * derivato da un canale vendite) ma nessun Codice IVA attivo del tenant
 * coincide: non fabbrica un codice, conserva solo l'aliquota (§ reverse-match
 * vendite online/corrispettivi).
 */
export function buildUnmatchedRateSnapshot(ratePercent: number): Prisma.InputJsonObject {
  return { ratePercent, matched: false };
}

/** Forma "letta" di uno snapshot IVA (JSONB già deserializzato da Prisma). */
export interface VatSnapshotLike {
  readonly code?: string;
  readonly ratePercent?: number;
  readonly description?: string;
  readonly natureLabel?: string;
  readonly matched?: boolean;
}

function readVatSnapshot(value: unknown): VatSnapshotLike | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as VatSnapshotLike;
}

/**
 * Aliquota (arrotondata) contenuta in uno snapshot IVA salvato su una riga
 * (§9). Fonte di lettura per ricalcoli/display quando la riga va riletta dal
 * DB: non esiste più una colonna aliquota grezza persistita separatamente,
 * lo snapshot congelato al salvataggio resta l'unica fonte stabile.
 */
export function vatSnapshotRatePercent(value: unknown): number | null {
  const snapshot = readVatSnapshot(value);
  if (!snapshot || snapshot.ratePercent == null) {
    return null;
  }
  return Math.round(snapshot.ratePercent);
}

/**
 * Etichetta leggibile per una riga con Codice IVA/snapshot (display §Piano
 * IVA fase 2, punto 4): codice riconosciuto se presente, altrimenti solo
 * l'aliquota grezza osservata. Null se non c'è alcun dato IVA.
 */
export function vatSnapshotDisplayLabel(value: unknown): string | null {
  const snapshot = readVatSnapshot(value);
  if (!snapshot) {
    return null;
  }
  if (snapshot.code) {
    return snapshot.ratePercent != null ? `${snapshot.code} (${snapshot.ratePercent}%)` : snapshot.code;
  }
  if (snapshot.ratePercent != null) {
    return `${snapshot.ratePercent}%`;
  }
  return null;
}
