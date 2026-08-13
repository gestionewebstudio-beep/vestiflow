import { DocumentType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { findChronologyAnomalies } from './document-chronology.util';

/**
 * Tx finto che **esegue davvero la regola** invece di restituire una risposta
 * preconfezionata: la query SQL non si può eseguire qui, ma la sua semantica sì,
 * ed è quella che deve restare vera. Il calcolo è lo stesso della funzione
 * finestra — il massimo delle date dei numeri precedenti — scritto una volta
 * sola, in modo che un test non possa passare per come è stato scritto il test.
 */
function txConDocumenti(
  documenti: readonly { id: string; number: number; data: string; reference?: string }[],
) {
  const queryRaw = vi.fn(async () => {
    const ordinati = [...documenti].sort((a, b) => a.number - b.number);
    const fuoriPosto: { id: string; number: number; data: Date; reference: string | null }[] = [];
    let massimoPrecedente: string | null = null;
    for (const doc of ordinati) {
      if (massimoPrecedente !== null && doc.data < massimoPrecedente) {
        fuoriPosto.push({
          id: doc.id,
          number: doc.number,
          data: new Date(doc.data),
          reference: doc.reference ?? null,
        });
      }
      if (massimoPrecedente === null || doc.data > massimoPrecedente) {
        massimoPrecedente = doc.data;
      }
    }
    return fuoriPosto;
  });
  return { queryRaw, tx: { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient };
}

function anomalie(documenti: Parameters<typeof txConDocumenti>[0]) {
  const { tx } = txConDocumenti(documenti);
  return findChronologyAnomalies({
    tx,
    tenantId: 'tenant-1',
    type: DocumentType.goods_receipt,
    series: 'A',
    source: 'document',
  });
}

describe('findChronologyAnomalies', () => {
  it('serie in ordine: nessuna anomalia', async () => {
    await expect(
      anomalie([
        { id: 'a', number: 1, data: '2026-06-01' },
        { id: 'b', number: 2, data: '2026-06-03' },
        { id: 'c', number: 3, data: '2026-06-10' },
      ]),
    ).resolves.toEqual([]);
  });

  /**
   * **Stessa data non è mai anomalia**, ed è il punto su cui il `<` stretto fa
   * la differenza: dentro la giornata l'ordine dei numeri non significa niente.
   * Con un `<=` questa serie — perfettamente legittima — risulterebbe rotta.
   */
  it('numeri fuori ordine nello STESSO giorno: nessuna anomalia', async () => {
    await expect(
      anomalie([
        { id: 'a', number: 1, data: '2026-06-05' },
        { id: 'b', number: 2, data: '2026-06-05' },
        { id: 'c', number: 3, data: '2026-06-05' },
      ]),
    ).resolves.toEqual([]);
  });

  // Il numero 5 forzato a mano con data anteriore al 9: è lui a essere fuori
  // posto, non il 9 — la data del 5 è più vecchia di quella di un numero minore.
  it('numero forzato a mano indietro nel tempo: è quel documento a essere in anomalia', async () => {
    const trovate = await anomalie([
      { id: 'a', number: 1, data: '2026-08-01' },
      { id: 'b', number: 5, data: '2026-07-20' },
      { id: 'c', number: 9, data: '2026-08-10' },
    ]);

    expect(trovate.map((riga) => riga.number)).toEqual([5]);
  });

  /**
   * **Il caso terminale del §2**, che l'avviso deve segnalare: esiste il 15
   * datato avanti, i numeri sotto si esauriscono, e la proposta scavalca. Il 16
   * nasce datato oggi contro il 15 datato fra una settimana.
   *
   * L'anomalia è del 16, e va detta: non l'ha creata il sistema — l'ha creata
   * chi ha assegnato il 15 con data futura — ma esiste davvero nei dati.
   */
  it('caso terminale: il numero che scavalca un documento datato avanti', async () => {
    const trovate = await anomalie([
      { id: 'a', number: 10, data: '2026-08-01' },
      { id: 'b', number: 15, data: '2026-08-18' },
      { id: 'c', number: 16, data: '2026-08-11' },
    ]);

    expect(trovate.map((riga) => riga.number)).toEqual([16]);
  });

  // L'avviso deve dire COSA c'è da sistemare: un elenco di uno non lo direbbe.
  it('elenca tutti i documenti fuori posto, non solo l’ultimo', async () => {
    const trovate = await anomalie([
      { id: 'a', number: 1, data: '2026-08-20' },
      { id: 'b', number: 2, data: '2026-08-02' },
      { id: 'c', number: 3, data: '2026-08-03' },
    ]);

    expect(trovate.map((riga) => riga.number)).toEqual([2, 3]);
  });

  it('restituisce riferimento e data di ogni documento fuori posto', async () => {
    const trovate = await anomalie([
      { id: 'a', number: 1, data: '2026-08-10' },
      { id: 'b', number: 2, data: '2026-08-01', reference: 'AM-A-0002' },
    ]);

    expect(trovate).toEqual([
      { id: 'b', number: 2, documentDate: new Date('2026-08-01'), reference: 'AM-A-0002' },
    ]);
  });
});

/**
 * I due difetti che **nessuna prova poteva vedere**, perché il tx finto qui
 * sopra esegue la regola in JavaScript e non guarda l'SQL: il riferimento
 * leggibile sugli ordini cliente (colonna `order_number`, non `reference` —
 * l'endpoint rispondeva 500) e la serie vuota (che è «senza serie», quindi
 * `series IS NULL` e non `series = ''` — il controllo non guardava mai la
 * partizione più usata). Trovati provando l'applicazione vera, il 13/08.
 *
 * Questi test non eseguono la query: **leggono cosa chiede**. È meno di un
 * test d'integrazione su un Postgres vero (vedi GUARDIE-MANCANTI, voce 12) ed
 * è tutto ciò che si può fare senza database.
 */
describe('findChronologyAnomalies — cosa chiede al database', () => {
  function sqlDi(input: Partial<Parameters<typeof findChronologyAnomalies>[0]>): Promise<string> {
    const queryRaw = vi.fn(async () => []);
    return findChronologyAnomalies({
      tx: { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient,
      tenantId: 'tenant-1',
      type: DocumentType.goods_receipt,
      series: 'A',
      source: 'document',
      ...input,
    }).then(() => {
      const [pezzi, ...valori] = queryRaw.mock.calls[0] as unknown as [
        readonly string[],
        ...unknown[],
      ];
      // Ricompone il testo: i frammenti Prisma portano le proprie stringhe,
      // i parametri veri diventano un segnaposto.
      return pezzi.reduce((testo, pezzo, i) => {
        const valore = valori[i];
        const frammento =
          valore && typeof valore === 'object' && Array.isArray((valore as { strings?: unknown }).strings)
            ? (valore as { strings: string[] }).strings.join('?')
            : i < valori.length
              ? '?'
              : '';
        return testo + pezzo + frammento;
      }, '');
    });
  }

  it('serie vuota vuol dire «senza serie», non «serie uguale a vuoto»', async () => {
    await expect(sqlDi({ series: '' })).resolves.toContain('series IS NULL');
  });

  it('anche se la serie è fatta di spazi', async () => {
    await expect(sqlDi({ series: '   ' })).resolves.toContain('series IS NULL');
  });

  it('una serie vera resta un confronto', async () => {
    const sql = await sqlDi({ series: 'A' });
    expect(sql).toContain('series = ');
    expect(sql).not.toContain('series IS NULL');
  });

  it('l’ordine cliente legge il proprio riferimento, che si chiama order_number', async () => {
    const sql = await sqlDi({ type: DocumentType.customer_order, source: 'sales_order' });
    expect(sql).toContain('sales_orders');
    expect(sql).toContain('order_number AS reference');
    expect(sql).toContain('placed_at');
  });

  it('l’ordine fornitore ha invece un reference suo', async () => {
    const sql = await sqlDi({ type: DocumentType.supplier_order, source: 'supplier_order' });
    expect(sql).toContain('supplier_orders');
    expect(sql).toContain('reference AS reference');
    expect(sql).toContain('order_date');
  });

  it('i documenti restano sulla loro tabella', async () => {
    const sql = await sqlDi({ source: 'document' });
    expect(sql).toContain('FROM documents');
    expect(sql).toContain('document_date');
  });
});
