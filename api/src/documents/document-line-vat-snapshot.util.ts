import type { Prisma } from '@prisma/client';

import { vatInputFromLegacyRate, type VatComputationInput } from '../vat/vat-line-calculation.util';
import { vatSnapshotRatePercent } from '../vat/vat-snapshot.util';

/** Il dato IVA di una riga già persistita: quanto basta a non rifotografarlo. */
export interface PersistedLineVat {
  readonly vatCodeId: string | null;
  readonly vatSnapshot: Prisma.JsonValue;
}

/** L'IVA risolta per una riga, nella forma che serve a scrivere e a calcolare. */
export interface ResolvedLineVat {
  readonly vatCodeId: string | null;
  readonly vatSnapshot: Prisma.InputJsonObject | null;
  readonly vat: VatComputationInput;
}

/**
 * Se una riga già esistente conserva il proprio snapshot IVA, e con quale.
 *
 * È il **contratto binario** del dominio documenti, e sta qui perché vale per
 * ogni flusso che risalva righe — non per un tipo:
 *
 * ```text
 * riga esistente + vatCodeId ASSENTE   → conserva vatCodeId e vatSnapshot persistiti
 * riga esistente + vatCodeId PRESENTE  → l'operatore ha scelto: risolve e rigenera
 * riga nuova                           → risoluzione normale del chiamante
 * ```
 *
 * ⚠️ **Perché serve.** Lo snapshot è il fatto fiscale di quel documento.
 * Rileggerlo dall'anagrafica a ogni salvataggio significa che modificare
 * l'aliquota di un Codice IVA ri-prezza i documenti già emessi: basta riaprirne
 * uno e correggere una nota. È la regola `regole-gestionale` → «la riga di un
 * documento è una fotografia, e non si riscatta da sola».
 *
 * ⚠️ **Gli IMPORTI si rifanno lo stesso**: dipendono da quantità, prezzo e
 * sconto, che l'operatore può aver cambiato. A restare fermo è l'ALIQUOTA, e
 * per questo il calcolo riparte da quella congelata nello snapshot.
 *
 * Ritorna `null` quando non c'è niente da conservare — riga nuova, oppure
 * modifica esplicita: in quel caso il chiamante risolve come farebbe sempre.
 */
export function preservedLineVat(
  lineId: string | null | undefined,
  declaredVatCodeId: string | null | undefined,
  persistedById: ReadonlyMap<string, PersistedLineVat> | undefined,
): ResolvedLineVat | null {
  if (!lineId || declaredVatCodeId !== undefined) {
    return null;
  }
  const persisted = persistedById?.get(lineId);
  if (!persisted) {
    return null;
  }
  return {
    vatCodeId: persisted.vatCodeId,
    vatSnapshot: (persisted.vatSnapshot ?? null) as Prisma.InputJsonObject | null,
    vat: vatInputFromLegacyRate(vatSnapshotRatePercent(persisted.vatSnapshot)),
  };
}
