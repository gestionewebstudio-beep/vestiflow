import { SalesOrderRefundKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  CORRISPETTIVI_ACCOUNTANT_HEADERS,
  CorrispettiviExportService,
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
      // «Canale» fino al 17/08/2026, quando le origini erano tre e venivano
      // tutte da un ordine. Il Corrispettivo manuale ordine non è e canale non
      // ne ha: l'ha digitato un operatore.
      'Origine',
      'Imponibile',
      'IVA',
      'Totale',
      'Valuta',
    ]) {
      expect(CORRISPETTIVI_ACCOUNTANT_HEADERS).toContain(attesa);
    }
  });

  it('non porta più «Canale», che con la quarta origine direbbe il falso', () => {
    expect(CORRISPETTIVI_ACCOUNTANT_HEADERS).not.toContain('Canale');
  });

  /**
   * Le due colonne entrate col Corrispettivo manuale stanno **in coda**, ed è la
   * proprietà che le rende innocue: chi ha un foglio di calcolo agganciato alle
   * dodici precedenti continua a leggere le stesse colonne agli stessi posti.
   * Infilarne una in mezzo sposterebbe tutto ciò che le sta a destra.
   */
  it('le colonne nuove sono in coda: le dodici precedenti non si spostano', () => {
    expect([...CORRISPETTIVI_ACCOUNTANT_HEADERS].slice(0, 12)).toEqual([
      'Data',
      'Tipo',
      'Numero ordine',
      'Origine',
      'Cliente',
      'Email cliente',
      'Imponibile',
      'IVA',
      'Totale',
      'Stato pagamento',
      'Nota',
      'Valuta',
    ]);
    expect([...CORRISPETTIVI_ACCOUNTANT_HEADERS].slice(12)).toEqual(['Sede', 'Dettaglio IVA']);
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
  /**
   * Un valore che il catalogo non conosce. Il caso che questa guardia aspettava
   * — il Corrispettivo manuale — è **arrivato il 17/08/2026 e ha preso il suo
   * nome**: `manual_receipt` → «Registrazione». Il test resta perché il caso
   * successivo non è ancora arrivato, e perché il database è condiviso fra rami
   * (un valore d'enum aggiunto altrove entra nei dati prima del codice che lo sa
   * nominare).
   */
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

  /**
   * ⚠️ **Il Corrispettivo manuale esce come «Vendita», ed è stata una
   * correzione.**
   *
   * Per un momento ha avuto un `kind` proprio, «Registrazione». È stato tolto il
   * 17/08/2026: economicamente rappresenta una vendita avvenuta, e
   * «Registrazione» era una distinzione TECNICA travestita da tipo evento —
   * caricava la colonna «Tipo» di ciò che appartiene all'**Origine**, che è
   * un'altra dimensione e ha la sua colonna.
   *
   * Il test resta perché la regola da presidiare è quella: Tipo dice *cosa è
   * successo*, Origine *da dove viene la riga*.
   */
  it('il Corrispettivo manuale esce come «Vendita»: a distinguerlo è l’Origine', () => {
    expect(corrispettivoRowTypeLabel({ kind: 'sale', refundKind: null })).toBe('Vendita');
    // E `CorrispettiviRowKind` non ha più un terzo valore: il tipo evento sono
    // due, vendita e rettifica.
    expect(Object.keys(ROW_TYPE_LABELS)).not.toContain('manual_receipt');
  });

  it('ogni gesto di rettifica del database ha la sua etichetta', () => {
    // Guardia che vale anche se qualcuno riallargasse la chiave della mappa a
    // `string`: il vincolo del compilatore sparirebbe, questo test no.
    for (const kind of Object.values(SalesOrderRefundKind)) {
      expect(ROW_TYPE_LABELS[kind]).toBeTruthy();
    }
  });
});

/**
 * PDF ed Excel sono la famiglia «esporta ciò che sto guardando»; il CSV no
 * (`docs/10` §17).
 *
 * ⚠️ **La differenza è deliberata, e questi test la inchiodano.** Il CSV è
 * l'export DATI per il commercialista: una riga per evento e le dodici colonne
 * storiche nella stessa posizione, perché qualcuno ci ha agganciato un foglio.
 * Farlo somigliare alla schermata romperebbe quel foglio senza che da questa
 * parte se ne accorga nessuno.
 */

const G18 = new Date('2026-08-18T10:00:00.000Z');
const G17 = new Date('2026-08-17T09:00:00.000Z');

function rigaFinta(id: string, quando: Date, totale: number) {
  return {
    rowId: `sale:${id}`,
    kind: 'sale' as const,
    salesOrderId: id,
    documentId: null,
    manualReceiptId: null,
    orderNumber: `#${id}`,
    occurredAt: quando,
    eventAt: quando,
    source: 'shopify_online' as const,
    customerName: 'Cliente prova',
    customerEmail: null,
    locationId: null,
    locationName: null,
    currency: 'EUR',
    taxableMinor: totale - 1800,
    taxMinor: 1800,
    totalMinor: totale,
    financialStatus: null,
    refundKind: null,
    note: null,
    vatBreakdown: [],
  };
}

function servizioExport(righe: readonly ReturnType<typeof rigaFinta>[]) {
  const corrispettivi = {
    buildRegisterRows: async () => righe,
    getSummary: async () => ({
      perGiornata: [
        {
          giorno: '2026-08-18',
          totali: { netTaxableMinor: 20400, netTaxMinor: 3600, netTotalMinor: 24000 },
        },
        {
          giorno: '2026-08-17',
          totali: { netTaxableMinor: 8200, netTaxMinor: 1800, netTotalMinor: 10000 },
        },
      ],
    }),
  };
  return new CorrispettiviExportService(
    {} as never,
    corrispettivi as never,
  );
}

describe('Excel segue la vista; il CSV resta piatto', () => {
  const righe = [rigaFinta('a', G17, 10000), rigaFinta('b', G18, 12000), rigaFinta('c', G18, 12000)];

  it('raggruppato: compaiono la data e la riga «Totale giornata»', async () => {
    const xml = await servizioExport(righe).exportAccountantSpreadsheet('t', {
      raggruppa: 'day',
    } as never);

    expect(xml).toContain('Data: 18/08/2026');
    expect(xml).toContain('Data: 17/08/2026');
    expect(xml).toContain('Totale giornata');
  });

  it('non raggruppato: nessuna riga artificiale', async () => {
    const xml = await servizioExport(righe).exportAccountantSpreadsheet('t', {} as never);

    expect(xml).not.toContain('Totale giornata');
    expect(xml).not.toContain('Data: 18/08/2026');
  });

  /** «Esporta ciò che sto guardando» vale anche per QUALI colonne si guardano. */
  it('le colonne spente non escono, e le accese restano nell’ordine del file', async () => {
    const xml = await servizioExport(righe).exportAccountantSpreadsheet('t', {
      colonne: ['occurredAt', 'taxable', 'tax', 'total'],
    } as never);

    expect(xml).toContain('>Data<');
    expect(xml).toContain('>Imponibile<');
    // Cliente è spenta nella vista: non deve comparire nel foglio.
    expect(xml).not.toContain('>Cliente<');
    expect(xml).not.toContain('>Email cliente<');
  });

  /**
   * ⚠️ Il CSV IGNORA raggruppamento e colonne: gli si passano gli stessi
   * parametri e non cambia niente. È la garanzia che protegge i fogli esterni.
   */
  it('il CSV ignora presentazione: dodici colonne storiche, nessun subtotale', async () => {
    const csv = await servizioExport(righe).exportAccountantCsv('t', {
      raggruppa: 'day',
      colonne: ['occurredAt'],
    } as never);

    const intestazione = csv.split('\r\n')[0] ?? '';
    expect(intestazione).toContain('Cliente');
    expect(intestazione).toContain('Valuta');
    expect(csv).not.toContain('Totale giornata');

    // Le dodici storiche, nello stesso ordine e negli stessi posti.
    const colonne = intestazione.replace(/^\uFEFF/, '').split(';');
    expect(colonne.slice(0, 12)).toEqual([
      'Data',
      'Tipo',
      'Numero ordine',
      'Origine',
      'Cliente',
      'Email cliente',
      'Imponibile',
      'IVA',
      'Totale',
      'Stato pagamento',
      'Nota',
      'Valuta',
    ]);
  });
});
