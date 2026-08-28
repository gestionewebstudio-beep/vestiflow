import { describe, expect, it } from 'vitest';

import { hasDeclaredEconomicSign } from '@domain/documents/models/document-economic-sign.util';

import {
  SALES_DOCUMENT_REGISTER_PROFILES,
  salesDocumentRegisterConfig,
} from './document-sales-register.config';

describe('registri di vendita — perimetro economicamente misto', () => {
  /**
   * ⛔ **La guardia che fa emergere un tipo NUOVO in un registro misto**
   * (`15c` §3, §12.1).
   *
   * Il perimetro misto non è un'opinione: è dichiarato QUI, dove un profilo che
   * elenca più di un tipo li fa convivere nello stesso totale. Se domani un
   * profilo ne guadagnasse uno senza direzione deliberata, il totale sommerebbe
   * versi opposti — e questa prova cade prima che accada.
   *
   * ⚠️ **Sta in `features/` e non accanto alla funzione del segno**, che vive in
   * `domain/`: `domain` non può importare da `features`, e la guardia ha bisogno
   * delle configurazioni. Il verso lo dichiara il dominio, il perimetro lo
   * dichiara la feature: la prova va dove stanno i dati che sorveglia.
   */
  it('⛔ ogni tipo di un registro MISTO ha una direzione economica deliberata', () => {
    const misti = SALES_DOCUMENT_REGISTER_PROFILES.filter(
      (p) => (salesDocumentRegisterConfig(p)?.types ?? []).length >= 2,
    );
    // Se questo diventasse zero, la guardia non sorveglierebbe più nulla.
    expect(misti.length).toBeGreaterThan(0);

    for (const profilo of misti) {
      for (const tipo of salesDocumentRegisterConfig(profilo)?.types ?? []) {
        expect(
          hasDeclaredEconomicSign(tipo),
          `il profilo ${profilo} mescola piu tipi e ${tipo} non ha una direzione dichiarata`,
        ).toBe(true);
      }
    }
  });
});
