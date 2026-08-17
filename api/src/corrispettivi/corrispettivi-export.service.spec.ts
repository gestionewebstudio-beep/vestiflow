import { SalesOrderRefundKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  CORRISPETTIVI_ACCOUNTANT_HEADERS,
  ROW_TYPE_LABELS,
  corrispettivoRowTypeLabel,
} from './corrispettivi-export.service';

/**
 * Test incrociato fra la decisione funzionale e il file che esce.
 *
 * La regola del 16/08/2026 è che **stampare o esportare non genera stati**:
 * l'operatore sceglie un periodo e produce il file quante volte vuole. Un
 * export che porta una colonna «Data consegna commercialista» contraddice
 * quella regola anche se nessuno la compila — perché **promette un flusso che
 * non esiste** a chi apre il foglio.
 *
 * Lo stesso vale per «Stato fiscale»: il Registro classifica per **origine**,
 * che è un fatto della vendita, non per uno stato parallelo.
 *
 * ⚠️ Questo test guarda le INTESTAZIONI, non le righe, ed è voluto: le
 * intestazioni sono il contratto del file verso il commercialista, e sono la
 * cosa che si riaggiunge per prima quando qualcuno «serve anche questo campo».
 */
describe('export corrispettivi — colonne del file', () => {
  it('non porta le colonne del vecchio flusso commercialista', () => {
    expect(CORRISPETTIVI_ACCOUNTANT_HEADERS).not.toContain('Data consegna commercialista');
    expect(CORRISPETTIVI_ACCOUNTANT_HEADERS).not.toContain('Stato fiscale');
  });

  it('porta le colonne economiche che il commercialista usa davvero', () => {
    for (const attesa of [
      'Data',
      'Tipo',
      'Numero ordine',
      'Canale',
      'Imponibile',
      'IVA',
      'Totale',
      'Valuta',
    ]) {
      expect(CORRISPETTIVI_ACCOUNTANT_HEADERS).toContain(attesa);
    }
  });

  it('nessuna intestazione nomina consegne, invii o registrazioni', () => {
    const sospette = CORRISPETTIVI_ACCOUNTANT_HEADERS.filter((h) =>
      /consegn|inviat|registrat|commercialista/i.test(h),
    );
    expect(sospette).toEqual([]);
  });
});

/**
 * La colonna «Tipo» dice quanto una riga vale, non solo come si chiama:
 * «Rettifica» significa segno negativo, e chi legge il file lo sottrae.
 *
 * Fino al 17/08/2026 un tipo non previsto usciva **come Rettifica**, perché la
 * mappa aveva un `?? 'Rettifica'` in coda. Questi test presidiano la regola che
 * quel fallback violava: **un tipo sconosciuto non può prendere in prestito il
 * significato economico di un tipo che esiste**.
 */
describe('export corrispettivi — etichetta della colonna «Tipo»', () => {
  /** Un valore che il catalogo non conosce: il Corrispettivo manuale è in arrivo. */
  const tipoNonPrevisto = { kind: 'sale', refundKind: 'nuovo_tipo' } as unknown as Parameters<
    typeof corrispettivoRowTypeLabel
  >[0];

  it('un tipo non previsto NON esce come «Rettifica»', () => {
    expect(corrispettivoRowTypeLabel(tipoNonPrevisto)).not.toBe('Rettifica');
  });

  it('un tipo non previsto non prende in prestito nessuna etichetta esistente', () => {
    // Non basta che non sia «Rettifica»: «Vendita» sarebbe altrettanto falso,
    // e a segno opposto.
    expect(Object.values(ROW_TYPE_LABELS)).not.toContain(
      corrispettivoRowTypeLabel(tipoNonPrevisto),
    );
  });

  it('le righe vere mantengono la loro etichetta', () => {
    expect(corrispettivoRowTypeLabel({ kind: 'sale', refundKind: null })).toBe('Vendita');
    expect(
      corrispettivoRowTypeLabel({
        kind: 'refund',
        refundKind: SalesOrderRefundKind.return_with_restock,
      }),
    ).toBe('Reso');
    expect(
      corrispettivoRowTypeLabel({ kind: 'refund', refundKind: SalesOrderRefundKind.refund_only }),
    ).toBe('Rimborso');
    expect(
      corrispettivoRowTypeLabel({ kind: 'refund', refundKind: SalesOrderRefundKind.cancellation }),
    ).toBe('Annullamento');
  });

  it('ogni gesto di rettifica del database ha la sua etichetta', () => {
    // Guardia che vale anche se qualcuno riallargasse la chiave della mappa a
    // `string`: il vincolo del compilatore sparirebbe, questo test no.
    for (const kind of Object.values(SalesOrderRefundKind)) {
      expect(ROW_TYPE_LABELS[kind]).toBeTruthy();
    }
  });
});
