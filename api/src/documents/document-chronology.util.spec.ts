import { DocumentType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { findChronologyConflicts } from './document-chronology.util';

/** Un documento già registrato nella partizione. */
interface Registrato {
  readonly id: string;
  readonly number: number;
  readonly data: string;
  readonly reference?: string;
}

/**
 * Tx finto che **esegue davvero la regola** invece di restituire una risposta
 * preconfezionata: la query SQL non si può eseguire qui, ma la sua semantica sì,
 * ed è quella che deve restare vera.
 *
 * Il limite, dichiarato: la regola è riscritta in JavaScript, quindi un `<=`
 * messo per errore nell'SQL non lo prenderebbe. Per quello servono i test sulla
 * FORMA della query (sotto) e, per la certezza, un Postgres vero — vedi
 * `GUARDIE-MANCANTI.md` voce 12.
 */
function txCon(documenti: readonly Registrato[]) {
  const queryRaw = vi.fn(async () => {
    // I due estremi, uno per verso, come fanno le due sotto-query.
    const precede = documenti
      .filter((d) => d.number < numeroCorrente && d.data > dataCorrente)
      .sort((a, b) => b.data.localeCompare(a.data))[0];
    const segue = documenti
      .filter((d) => d.number > numeroCorrente && d.data < dataCorrente)
      .sort((a, b) => a.data.localeCompare(b.data))[0];
    return [
      ...(precede ? [{ ...precede, data: new Date(precede.data), direzione: 'precede' }] : []),
      ...(segue ? [{ ...segue, data: new Date(segue.data), direzione: 'segue' }] : []),
    ].map((r) => ({ id: r.id, number: r.number, data: r.data, reference: r.reference ?? null, direzione: r.direzione }));
  });
  return { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;
}

let numeroCorrente = 0;
let dataCorrente = '';

function conflitti(documenti: readonly Registrato[], number: number, data: string) {
  numeroCorrente = number;
  dataCorrente = data;
  return findChronologyConflicts({
    tx: txCon(documenti),
    tenantId: 'tenant-1',
    type: DocumentType.goods_receipt,
    series: 'A',
    source: 'document',
    number,
    documentDate: new Date(data),
  });
}

describe('findChronologyConflicts — la regola', () => {
  /**
   * Il caso che ha fatto riscrivere il controllo (misurato il 13/08/2026 su
   * Danea e sul nostro sistema): oggi creo il n.1 datato domani, poi ne apro un
   * altro che prende il n.2 con la data di oggi. Il n.2 nasce fuori ordine, e
   * l'avviso deve comparire ORA — non al salvataggio dopo.
   */
  it('numero più basso datato dopo di me: è il caso di tutti i giorni', async () => {
    const trovati = await conflitti(
      [{ id: 'a', number: 1, data: '2026-08-14', reference: 'PRE-0001' }],
      2,
      '2026-08-13',
    );

    expect(trovati).toHaveLength(1);
    expect(trovati[0]).toMatchObject({ number: 1, reference: 'PRE-0001', direction: 'precede' });
  });

  it('numero più alto datato prima di me: il verso simmetrico', async () => {
    const trovati = await conflitti(
      [{ id: 'a', number: 9, data: '2026-08-01', reference: 'PRE-0009' }],
      5,
      '2026-08-10',
    );

    expect(trovati).toHaveLength(1);
    expect(trovati[0]).toMatchObject({ number: 9, direction: 'segue' });
  });

  it('entrambi i versi insieme: due conflitti, uno per verso', async () => {
    const trovati = await conflitti(
      [
        { id: 'a', number: 1, data: '2026-08-20' },
        { id: 'b', number: 9, data: '2026-08-01' },
      ],
      5,
      '2026-08-10',
    );

    expect(trovati.map((c) => c.direction)).toEqual(['precede', 'segue']);
  });

  /**
   * **Il test che oggi mancava, ed è il primo dei due chiesti.** La serie è
   * disordinata (il n.1 di domani e il n.2 di oggi si contraddicono fra loro),
   * ma il documento che sto salvando — n.3, datato dopo entrambi — sta in
   * ordine con tutti. Non deve dire niente: il disordine vecchio non è affare
   * suo, e prima questo era esattamente il caso che avvisava.
   */
  it('documento in ordine dentro una serie disordinata: nessun avviso', async () => {
    const serieDisordinata = [
      { id: 'a', number: 1, data: '2026-08-14' },
      { id: 'b', number: 2, data: '2026-08-13' },
    ];

    await expect(conflitti(serieDisordinata, 3, '2026-08-20')).resolves.toEqual([]);
  });

  it('stessa data non è mai un conflitto: dentro la giornata l’ordine è libero', async () => {
    const stessoGiorno = [
      { id: 'a', number: 1, data: '2026-08-13' },
      { id: 'b', number: 9, data: '2026-08-13' },
    ];

    await expect(conflitti(stessoGiorno, 5, '2026-08-13')).resolves.toEqual([]);
  });

  it('serie in ordine: niente da dire', async () => {
    const inOrdine = [
      { id: 'a', number: 1, data: '2026-06-01' },
      { id: 'b', number: 2, data: '2026-06-03' },
    ];

    await expect(conflitti(inOrdine, 3, '2026-06-10')).resolves.toEqual([]);
  });
});

/**
 * I difetti che **nessuna prova poteva vedere**, perché il tx finto qui sopra
 * esegue la regola in JavaScript e non guarda l'SQL: il riferimento leggibile
 * sugli ordini cliente (colonna `order_number`, non `reference` — l'endpoint
 * rispondeva 500) e la serie vuota (che è «senza serie», quindi `series IS
 * NULL` e non `series = ''` — il controllo non guardava mai la partizione più
 * usata). Trovati provando l'applicazione vera, il 13/08.
 *
 * Questi test non eseguono la query: **leggono cosa chiede**.
 */
describe('findChronologyConflicts — cosa chiede al database', () => {
  function sqlDi(input: Partial<Parameters<typeof findChronologyConflicts>[0]>): Promise<string> {
    const queryRaw = vi.fn(async () => []);
    return findChronologyConflicts({
      tx: { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient,
      tenantId: 'tenant-1',
      type: DocumentType.goods_receipt,
      series: 'A',
      source: 'document',
      number: 5,
      documentDate: new Date('2026-08-13'),
      ...input,
    }).then(() => {
      const [pezzi, ...valori] = queryRaw.mock.calls[0] as unknown as [
        readonly string[],
        ...unknown[],
      ];
      // Ricompone il testo: i frammenti Prisma portano le proprie stringhe, i
      // parametri veri diventano un segnaposto.
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

  it('i confronti sono STRETTI, in tutti e quattro i punti', async () => {
    const sql = await sqlDi({});

    expect(sql).toContain('number < ?');
    expect(sql).toContain('number > ?');
    expect(sql).not.toContain('number <= ?');
    expect(sql).not.toContain('number >= ?');
    expect(sql).not.toContain('>= ?');
  });

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

  it('in modifica il documento non fa conflitto con la propria riga vecchia', async () => {
    const sql = await sqlDi({ excludeId: 'doc-1' });
    expect(sql).toContain('id <> ');
  });

  it('senza documento da escludere la clausola non compare', async () => {
    const sql = await sqlDi({});
    expect(sql).not.toContain('id <> ');
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
