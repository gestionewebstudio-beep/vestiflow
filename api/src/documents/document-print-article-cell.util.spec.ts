import { describe, expect, it } from 'vitest';

import { printArticleCellLines } from './document-print-article-cell.util';

/**
 * ⚠️ Questi test esistono per una ragione precisa: la cella articolo della
 * stampa **non aveva copertura**, perché pdfkit comprime i flussi e l'unica
 * asserzione possibile sul buffer è che cominci per `%PDF`.
 *
 * Quando la variante è uscita dalla descrizione per prendersi la sua colonna,
 * niente sarebbe diventato rosso: la stampa avrebbe smesso di dire la taglia,
 * e lo si sarebbe scoperto da un DDT sbagliato in mano a un corriere.
 */
describe('printArticleCellLines — la cella articolo della stampa', () => {
  it('nome, variante, SKU, seriali: in quest’ordine', () => {
    expect(
      printArticleCellLines({
        description: 'Maglia cotone',
        variantLabel: 'M / Rosso',
        sku: 'MAG-M-ROS',
        serialNumbers: ['SN-1', 'SN-2'],
      }),
    ).toEqual(['Maglia cotone', 'M / Rosso', 'SKU: MAG-M-ROS', 'Seriali: SN-1, SN-2']);
  });

  it('⛔ la variante compare: senza, la stampa perde taglia e colore', () => {
    const righe = printArticleCellLines({
      description: 'Maglia cotone',
      variantLabel: 'M / Rosso',
      sku: 'MAG-M-ROS',
    });

    expect(righe).toContain('M / Rosso');
    // E il nome resta il nome: la variante sta su una riga sua, non impastata.
    expect(righe[0]).toBe('Maglia cotone');
  });

  it('articolo senza varianti: nessuna riga vuota in mezzo', () => {
    expect(
      printArticleCellLines({ description: 'Cintura', variantLabel: '', sku: 'CIN-U' }),
    ).toEqual(['Cintura', 'SKU: CIN-U']);
  });

  it('riga economica senza articolo: solo la descrizione', () => {
    expect(printArticleCellLines({ description: 'Spese di trasporto' })).toEqual([
      'Spese di trasporto',
    ]);
  });

  it('variantLabel null si comporta come vuota', () => {
    expect(printArticleCellLines({ description: 'Cintura', variantLabel: null })).toEqual([
      'Cintura',
    ]);
  });
});
