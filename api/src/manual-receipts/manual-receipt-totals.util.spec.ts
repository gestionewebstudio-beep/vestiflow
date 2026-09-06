import { describe, expect, it } from 'vitest';

import { grossFromNetMinor } from '../vat/vat-line-calculation.util';
import type { VatCodeWithNature } from '../vat/vat-codes.service';
import {
  computeManualReceiptLines,
  computeManualReceiptTotals,
  isEmptyManualReceiptLine,
} from './manual-receipt-totals.util';

/**
 * La matematica del Corrispettivo manuale (`10` §12, prove 2–6 del §13).
 *
 * ⚠️ **Il test che decide se la funzione è fatta bene** è il primo: 70,00 ivati
 * al 22%, salvati e riaperti in modalità Ivati, devono tornare **70,00** — non
 * 69,99, non 70,01. È il difetto che il legacy aveva per costruzione, perché i
 * suoi importi erano `Int`: con un intero la coda dello scorporo muore al
 * salvataggio e il ritorno vale un centesimo di meno.
 */

/**
 * Un Codice IVA di prova.
 *
 * ⚠️ `ratePercent` è `number` e non `Decimal`: la colonna vera è `NUMERIC`, ma
 * `vatInputFromVatCode` la fa passare da `Number()` e qui interessa il valore.
 * Il parametro NON estende `Partial<VatCodeWithNature>` proprio per questo —
 * intersecarli darebbe `Decimal & number`, che nessun letterale soddisfa.
 */
function vatCode(overrides: { id: string; ratePercent: number; usageScope?: string }) {
  return {
    code: `IVA${overrides.ratePercent}`,
    description: `Aliquota ${overrides.ratePercent}%`,
    notes: null,
    nonDeductiblePercent: 0,
    calculationMode: 'standard',
    vatAffectsSupplierTotal: true,
    usageScope: 'both',
    isActive: true,
    nature: { key: 'standard', label: 'Imponibile', officialCode: null },
    ...overrides,
  } as unknown as VatCodeWithNature;
}

const IVA_22 = vatCode({ id: 'vat-22', ratePercent: 22 });
const IVA_10 = vatCode({ id: 'vat-10', ratePercent: 10 });
const CODICI = new Map<string, VatCodeWithNature>([
  ['vat-22', IVA_22],
  ['vat-10', IVA_10],
]);

describe('Corrispettivo manuale — il giro dell’importo ivato', () => {
  /**
   * L'elenco tiene insieme importi che con un intero perderebbero il centesimo e
   * importi che tornerebbero comunque: la regola vale per tutti, non solo per
   * quelli rotti.
   */
  it.each([
    { grossMinor: 7000, atteso: 'il caso della specifica' },
    { grossMinor: 103, atteso: 'perde con Int' },
    { grossMinor: 502, atteso: 'perde con Int' },
    { grossMinor: 12345, atteso: 'perde con Int' },
    { grossMinor: 1290, atteso: 'torna comunque' },
    { grossMinor: 2500, atteso: 'torna comunque' },
  ])(
    'importo ivato $grossMinor salvato e riaperto ivato torna identico ($atteso)',
    ({ grossMinor }) => {
      const [line] = computeManualReceiptLines(
        [{ description: 'Vendite cassa esterna', amountMinor: grossMinor, vatCodeId: 'vat-22' }],
        CODICI,
        true,
      );

      // Rimostrare l'ivato è un punto di USCITA: si arrotonda lì, e solo lì. Se
      // il netto memorizzato porta la sua coda, il giro torna.
      expect(grossFromNetMinor(line!.netAmountMinor, 22)).toBe(grossMinor);
    },
  );

  it('70,00 ivati al 22%: imponibile 57,38, IVA 12,62, totale 70,00', () => {
    const lines = computeManualReceiptLines(
      [{ description: 'Chiusura cassa', amountMinor: 7000, vatCodeId: 'vat-22' }],
      CODICI,
      true,
    );

    expect(lines[0]!.netMinor).toBe(5738);
    expect(lines[0]!.vatMinor).toBe(1262);
    expect(lines[0]!.grossMinor).toBe(7000);
    // Il netto MEMORIZZATO non è l'arrotondato: porta la coda, ed è un'altra
    // cosa dal netto che si mostra.
    expect(lines[0]!.netAmountMinor).not.toBe(5738);
    expect(lines[0]!.netAmountMinor).toBeCloseTo(5737.7049, 4);
  });

  it('la coda si ferma dove la colonna arriva: 4 cifre di centesimo', () => {
    const [line] = computeManualReceiptLines(
      [{ description: 'Cassa', amountMinor: 7000, vatCodeId: 'vat-22' }],
      CODICI,
      true,
    );
    // `NUMERIC(16,6)` rifiuterebbe una scala maggiore, e oltre quelle cifre non
    // c'è precisione: c'è il rumore del float (7000/1,22 in binario non finisce).
    const cifreDiCoda = String(line!.netAmountMinor).split('.')[1]?.length ?? 0;
    expect(cifreDiCoda).toBeLessThanOrEqual(4);
  });
});

describe('Corrispettivo manuale — cambio Ivati/Netti', () => {
  /**
   * Prova 3 del §13: **i valori si convertono, non si reinterpretano**.
   *
   * Chi salva in modalità netta rimanda il netto che la maschera gli ha
   * mostrato: la registrazione deve continuare a valere 70,00, non 85,40 (che
   * sarebbe lo stesso numero riletto come netto).
   */
  it('lo stesso incasso salvato netto vale quanto salvato ivato', () => {
    const ivato = computeManualReceiptTotals(
      computeManualReceiptLines(
        [{ description: 'Cassa', amountMinor: 7000, vatCodeId: 'vat-22' }],
        CODICI,
        true,
      ),
    );
    // La maschera, passando a «Netti», mostra il netto arrotondato: 57,38.
    const netto = computeManualReceiptTotals(
      computeManualReceiptLines(
        [{ description: 'Cassa', amountMinor: 5738, vatCodeId: 'vat-22' }],
        CODICI,
        false,
      ),
    );

    expect(ivato).toEqual({ subtotalMinor: 5738, taxMinor: 1262, totalMinor: 7000 });
    expect(netto).toEqual(ivato);
  });

  it('reinterpretare invece di convertire cambierebbe il totale del 22%', () => {
    // Il difetto che la prova 3 esclude: stesso «70,00» a schermo, letto come
    // netto. Il totale salirebbe a 85,40 senza che nulla si muova sotto gli
    // occhi di chi sta compilando.
    const reinterpretato = computeManualReceiptTotals(
      computeManualReceiptLines(
        [{ description: 'Cassa', amountMinor: 7000, vatCodeId: 'vat-22' }],
        CODICI,
        false,
      ),
    );
    expect(reinterpretato.totalMinor).toBe(8540);
  });
});

describe('Corrispettivo manuale — più aliquote nella stessa registrazione', () => {
  /** Prova 4 del §13: è il caso reale di una chiusura di cassa mista. */
  it('somma righe a 22% e 10% tenendole distinte', () => {
    const lines = computeManualReceiptLines(
      [
        { description: 'Vendite cassa esterna', amountMinor: 7000, vatCodeId: 'vat-22' },
        { description: 'Vendite cassa esterna', amountMinor: 3000, vatCodeId: 'vat-10' },
      ],
      CODICI,
      true,
    );

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ netMinor: 5738, vatMinor: 1262, grossMinor: 7000 });
    expect(lines[1]).toMatchObject({ netMinor: 2727, vatMinor: 273, grossMinor: 3000 });

    // Il totale è la somma della colonna, riga per riga: è ciò che rende la
    // registrazione verificabile a occhio.
    expect(computeManualReceiptTotals(lines)).toEqual({
      subtotalMinor: 8465,
      taxMinor: 1535,
      totalMinor: 10000,
    });
  });

  it('la numerazione delle righe segue l’ordine in cui arrivano', () => {
    const lines = computeManualReceiptLines(
      [
        { description: 'Prima', amountMinor: 100, vatCodeId: 'vat-22' },
        { description: 'Seconda', amountMinor: 200, vatCodeId: 'vat-10' },
      ],
      CODICI,
      true,
    );
    expect(lines.map((line) => line.lineNumber)).toEqual([1, 2]);
  });
});

describe('Corrispettivo manuale — lo snapshot del Codice IVA', () => {
  /**
   * Prova 6 del §13: cambiando il Codice IVA, **la registrazione storica non
   * cambia**. È l'unica cosa che si eredita dal legacy, ed era la sua parte
   * migliore.
   */
  it('congela aliquota, codice e natura sulla riga', () => {
    const [line] = computeManualReceiptLines(
      [{ description: 'Cassa', amountMinor: 7000, vatCodeId: 'vat-22' }],
      CODICI,
      true,
    );

    expect(line!.vatSnapshot).toMatchObject({
      code: 'IVA22',
      ratePercent: 22,
      natureKey: 'standard',
      calculationMode: 'standard',
    });
  });

  it('lo snapshot è una COPIA: modificare il codice dopo non tocca la riga', () => {
    const [line] = computeManualReceiptLines(
      [{ description: 'Cassa', amountMinor: 7000, vatCodeId: 'vat-22' }],
      CODICI,
      true,
    );
    const snapshotPrima = { ...(line!.vatSnapshot as Record<string, unknown>) };

    // Il Codice IVA cambia in anagrafica: dal 23% in poi, ma non per ieri.
    const codiciDopo = new Map(CODICI);
    codiciDopo.set('vat-22', vatCode({ id: 'vat-22', ratePercent: 23 }));

    expect(line!.vatSnapshot).toEqual(snapshotPrima);
    expect((line!.vatSnapshot as { ratePercent: number }).ratePercent).toBe(22);
  });
});

describe('Corrispettivo manuale — la riga vuota', () => {
  /**
   * Prova 5 del §13. La maschera tiene sempre in fondo una riga pronta
   * all'inserimento, e quella riga arriva col Codice IVA già proposto: guardare
   * il solo Codice IVA la farebbe sembrare compilata.
   */
  it('vuota è: nessuna descrizione E nessun importo', () => {
    expect(
      isEmptyManualReceiptLine({ description: '', amountMinor: 0, vatCodeId: 'vat-22' }),
    ).toBe(true);
    expect(
      isEmptyManualReceiptLine({ description: '   ', amountMinor: 0, vatCodeId: 'vat-22' }),
    ).toBe(true);
  });

  it('una riga con un importo NON è vuota, anche senza descrizione', () => {
    expect(
      isEmptyManualReceiptLine({ description: '', amountMinor: 100, vatCodeId: 'vat-22' }),
    ).toBe(false);
    expect(
      isEmptyManualReceiptLine({ description: 'Cassa', amountMinor: 0, vatCodeId: 'vat-22' }),
    ).toBe(false);
  });
});
